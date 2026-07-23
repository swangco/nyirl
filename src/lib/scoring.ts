import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type {
  curatedLinks,
  founderStageEnum,
  genderIdentityEnum,
  profiles,
  profileTypeEnum,
} from "@/db/schema";
import { cosineSimilarity } from "@/lib/embeddings";

type Profile = typeof profiles.$inferSelect;

/**
 * Maps a profile's gender to the event/link tag that signals "this is
 * oriented toward you" (e.g. "Female Investor Coffee" carries
 * womens_focused). Deliberately positive-only: a profile with no match, or
 * no gender set at all, is never penalized — this only ever adds a boost
 * when a genuine orientation signal exists on both sides.
 */
const GENDER_ORIENTATION_TAGS: Partial<Record<(typeof genderIdentityEnum)[number], string>> = {
  woman: "womens_focused",
  man: "mens_focused",
};

type ProfileTypeCriterion = {
  weight: number;
  target_types?: (typeof profileTypeEnum)[number][];
  adjacent_types?: (typeof profileTypeEnum)[number][];
};

type StageCriterion = {
  weight: number;
  target_stages: (typeof founderStageEnum)[number][];
};

type CriteriaWeights = {
  profile_type_match?: ProfileTypeCriterion;
  profile_completeness?: { weight: number };
  /** Founders only — scores highest if the profile's stage is in the target list. */
  stage_match?: StageCriterion;
  /** Founders only — a binary "has raised something vs. hasn't" signal, since
   * fundingRaised is free text, not a structured number. */
  funding_signal?: { weight: number };
  /** Investors only — rewards a minimum rough number of checks written. */
  checks_written_min?: { weight: number; min: number };
  /** Optional — rewards overlap between the profile's interests and the
   * event's tags (e.g. a "pickleball" event tag matching a profile that
   * lists pickleball as an interest). */
  interest_match?: { weight: number };
  /** Optional — rewards a profile's gender matching an event's stated
   * orientation (see GENDER_ORIENTATION_TAGS). Never penalizes a profile
   * with no gender set or no match; only ever adds signal when both sides
   * genuinely align. */
  gender_orientation_match?: { weight: number };
};

type ScorableProfile = Pick<
  Profile,
  | "profileType"
  | "resumeUrl"
  | "bioBlurb"
  | "stage"
  | "fundingRaised"
  | "checksWritten"
  | "genderIdentity"
  | "interests"
>;

/** Deterministic 0-100 score from the host's weighted rubric. Pure function, no I/O. */
export function computeStructuralScore(
  profile: ScorableProfile,
  criteriaWeightsJson: string | null,
  eventTags: string[] | null = null,
): number {
  const criteria: CriteriaWeights = criteriaWeightsJson
    ? JSON.parse(criteriaWeightsJson)
    : {};

  let totalWeight = 0;
  let weightedScore = 0;

  if (criteria.profile_type_match) {
    const { weight, target_types = [], adjacent_types = [] } =
      criteria.profile_type_match;
    const types = profile.profileType ?? [];
    let score = 1;
    if (types.some((t) => target_types.includes(t))) score = 9;
    else if (types.some((t) => adjacent_types.includes(t))) score = 3;

    totalWeight += weight;
    weightedScore += weight * score;
  }

  if (criteria.profile_completeness) {
    const { weight } = criteria.profile_completeness;
    const hasResume = !!profile.resumeUrl;
    const hasBlurb = !!profile.bioBlurb;
    const score = hasResume && hasBlurb ? 9 : hasResume || hasBlurb ? 3 : 1;

    totalWeight += weight;
    weightedScore += weight * score;
  }

  if (criteria.stage_match) {
    const { weight, target_stages } = criteria.stage_match;
    const score = profile.stage && target_stages.includes(profile.stage) ? 9 : profile.stage ? 3 : 1;

    totalWeight += weight;
    weightedScore += weight * score;
  }

  if (criteria.funding_signal) {
    const { weight } = criteria.funding_signal;
    const raised = (profile.fundingRaised ?? "").trim().toLowerCase();
    const hasRaised = raised.length > 0 && !/^(none|no|not yet|0|n\/a)/.test(raised);
    const score = hasRaised ? 9 : raised.length > 0 ? 3 : 1;

    totalWeight += weight;
    weightedScore += weight * score;
  }

  if (criteria.checks_written_min) {
    const { weight, min } = criteria.checks_written_min;
    const checks = profile.checksWritten ?? 0;
    const score = checks >= min ? 9 : checks > 0 ? 3 : 1;

    totalWeight += weight;
    weightedScore += weight * score;
  }

  if (criteria.interest_match) {
    const { weight } = criteria.interest_match;
    const interests = profile.interests ?? [];
    const tags = eventTags ?? [];
    const hasOverlap = interests.some((i) => tags.includes(i));
    const score = hasOverlap ? 9 : interests.length > 0 ? 3 : 1;

    totalWeight += weight;
    weightedScore += weight * score;
  }

  if (criteria.gender_orientation_match) {
    const { weight } = criteria.gender_orientation_match;
    const orientationTag = profile.genderIdentity
      ? GENDER_ORIENTATION_TAGS[profile.genderIdentity]
      : undefined;
    const tags = eventTags ?? [];
    const score = orientationTag && tags.includes(orientationTag) ? 9 : 3;

    totalWeight += weight;
    weightedScore += weight * score;
  }

  if (totalWeight === 0) return 50; // no rubric defined — neutral

  return Math.round((weightedScore / (totalWeight * 9)) * 100);
}

const SemanticScoreSchema = z.object({
  relevance_score: z.number().min(0).max(100),
  rationale: z.string().max(200),
  flags: z.array(z.string()),
});

export type SemanticScoreResult = z.infer<typeof SemanticScoreSchema>;

/** AI-scored fit against the host's free-text brief. Falls back to a neutral score if the model call fails. */
export async function computeSemanticScore(input: {
  idealAttendeeBrief: string | null;
  resumeText: string | null;
  bioBlurb: string | null;
  title: string | null;
  company: string | null;
}): Promise<SemanticScoreResult> {
  if (!input.idealAttendeeBrief) {
    return { relevance_score: 50, rationale: "No event brief set.", flags: [] };
  }

  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: SemanticScoreSchema,
      prompt: `You are screening a registrant for an event. Score how well they fit, from 0-100.

Event's ideal attendee brief:
"""
${input.idealAttendeeBrief}
"""

Registrant:
Title: ${input.title ?? "(not provided)"}
Company: ${input.company ?? "(not provided)"}
Bio: ${input.bioBlurb ?? "(not provided)"}
Resume text: ${input.resumeText ?? "(not provided)"}

Give a relevance_score (0-100), a rationale under 20 words the host will read next to this person's name, and any flags (e.g. "no resume provided", "reads like a pitch, not a bio").`,
    });
    return object;
  } catch (err) {
    console.error("Semantic scoring failed:", err);
    return {
      relevance_score: 50,
      rationale: "AI scoring unavailable — needs manual review.",
      flags: ["ai_scoring_failed"],
    };
  }
}

export function computeCompositeScore(structural: number, semantic: number): number {
  return Math.round(0.6 * structural + 0.4 * semantic);
}

// ============================================================
// Discovery / digest scoring
// ------------------------------------------------------------
// Ranks curated links (and hosted events, in the digest) for a viewer. A rank
// decomposes into three orthogonal parts, blended by scoreCuratedLink:
//   relevance — does this match THIS viewer?   (semantic vector, else keyword fit)
//   quality   — is this a good listing at all?  (Curation Quality Score)
//   boosts    — explicit, additive, rule-based nudges (interests, gender)
// Vector cosine is a far better relevance signal than keyword overlap, so it is
// the primary relevance when embeddings exist; it says nothing about quality,
// which is why the CQS quality prior stays and is applied alongside it.
// See docs/superpowers/specs/2026-07-22-scoring-and-recsys-design.md.
// ============================================================

/** Relevance vs. quality blend — the same 60/40 split the registrant scorer uses. */
const RELEVANCE_WEIGHT = 0.6;
const QUALITY_WEIGHT = 0.4;

const PROFILE_TYPE_KEYWORDS: Record<(typeof profileTypeEnum)[number], string[]> = {
  founder: [
    "founder", "founders", "startup", "startups", "ceo", "entrepreneur",
    "venture", "demo", "pitch", "builders", "tech", "network",
    "networking", "mixer", "community", "industry",
  ],
  operator: ["operator", "operators", "ops", "growth", "gtm"],
  investor: ["investor", "investors", "venture", "fund", "capital", "angel"],
  engineer: [
    "engineer", "engineers", "developer", "technical", "hackathon", "build",
    "code", "hardware", "demo",
  ],
  marketing_gtm: ["marketing", "growth", "gtm", "brand", "content"],
  job_seeking: ["hiring", "job", "career", "recruiting", "talent"],
  other: [],
};

/**
 * Recognized tier-1 hosts (Serena's actual discovery criteria, captured
 * July 22, 2026 — see playbooks/event-registrant-scoring.md in the
 * knowledge graph for the full reasoning; expanded after the April–July
 * curation audit). Deliberately a growable allowlist: a host NOT on this
 * list gets no penalty, only no boost — guessing at reputation for an
 * unrecognized name is worse than an incomplete list.
 *
 * Entries are lowercase whitespace-normalized phrases and are matched on word
 * boundaries (see isTierOneHost), so short names like "yc" or "aws" match only
 * as whole tokens — never as a substring inside another word. Multi-word
 * phrases like "first round" match as an adjacent token run.
 *
 * TODO(stage-2): move this to a hosts table so edits don't require a deploy.
 */
const TIER_ONE_HOSTS = [
  "union square", "primary", "mark gamma", "tekakon", "sierra", "anthropic",
  "openai", "granola", "notion", "brazel", "andrew young", "andru yeung",
  "andrew yeung", "yonas", "the collective", "versi",
  // Added from the April–July curation audit:
  "replit", "revenuecat", "y combinator", "yc", "nvidia", "antler", "vercel",
  "stripe", "elevenlabs", "databricks", "mercury", "first round", "m13",
  "mongodb", "shopify", "cursor", "ramp", "spc", "modal", "datadog",
  "google deepmind", "microsoft", "aws", "tiktok", "brex", "firstmark",
  "gamma", "speedrun", "hubspot", "suno", "flybridge", "xai", "runway",
  "columbia university", "bergdorf goodman", "lvmh",
].map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));

/**
 * True if the preview text mentions a recognized tier-1 host. Normalizes the
 * text to space-delimited tokens and matches each host phrase as a whole-token
 * run — so "aws" won't hit inside "flaws", "yc" won't hit inside "cycling",
 * and a leading "YC ..." title still matches.
 */
function isTierOneHost(text: string): boolean {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  return TIER_ONE_HOSTS.some((host) => host.length > 0 && haystack.includes(` ${host} `));
}

/** Extracts an attendee count from scraped preview text, if present (e.g. Luma's "N attending"). */
function extractAttendeeCount(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:people\s+)?attending/i);
  return match ? parseInt(match[1], 10) : null;
}

// ---- Quality prior (Curation Quality Score) ----------------
// Item-intrinsic, viewer-independent. Sums to a 0-100 range.

const HOST_TIER_POINTS = { unknown: 0, tier_1: 35 };
const EXCLUSIVITY_POINTS = { open: 5, capped: 15, invite_only: 25 };
const FORMAT_POINTS = { expo: 5, mixer: 10, workshop: 12, hackathon: 12, dinner: 15 };
const LOCALITY_POINTS = { out_of_town: 0, nyc: 10 };
// Intimacy: smaller, more private rooms are the curation signal. Unknown size
// is treated as mid — most curated listings don't publish a headcount.
const INTIMACY_POINTS = { small: 15, medium: 8, large: 0, unknown: 8 };
// max = 35 + 25 + 15 + 10 + 15 = 100

type CuratedLink = typeof curatedLinks.$inferSelect;

/**
 * Deterministic 0-100 "how good is this listing" score for a curated link,
 * independent of any one visitor's profile. This is the quality prior that
 * semantic search cannot provide — cosine similarity ranks by match, not by
 * whether the event is worth going to. Host prestige, exclusivity, format,
 * NYC locality, and intimacy (smaller = more curated) all feed it.
 */
export function computeCurationQualityScore(
  link: Pick<CuratedLink, "title" | "description" | "exclusivity" | "format" | "outOfTown">,
): number {
  const text = `${link.title ?? ""} ${link.description ?? ""}`;
  const host = isTierOneHost(text) ? HOST_TIER_POINTS.tier_1 : HOST_TIER_POINTS.unknown;
  // Fall back to the schema defaults for any value outside the current enum
  // (legacy rows, manual SQL) so an unmapped value can't make the score NaN.
  const exclusivity = EXCLUSIVITY_POINTS[link.exclusivity] ?? EXCLUSIVITY_POINTS.capped;
  const format = FORMAT_POINTS[link.format] ?? FORMAT_POINTS.mixer;
  const locality = link.outOfTown ? LOCALITY_POINTS.out_of_town : LOCALITY_POINTS.nyc;
  const count = extractAttendeeCount(text);
  const intimacy =
    count === null
      ? INTIMACY_POINTS.unknown
      : count <= 50
        ? INTIMACY_POINTS.small
        : count <= 150
          ? INTIMACY_POINTS.medium
          : INTIMACY_POINTS.large;
  return host + exclusivity + format + locality + intimacy;
}

// ---- Relevance ---------------------------------------------

const WORD_RE = /[a-z0-9]+/g;
function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(WORD_RE) ?? []).filter((w) => w.length > 2));
}

/**
 * Keyword-overlap relevance FALLBACK, used when semantic embeddings aren't
 * available (no OPENAI_API_KEY, or an un-embedded row). Relevance only: profile
 * type keyword hits + distinctive bio-word overlap against the link's own text.
 * Host prestige and event size are quality signals and live in the CQS, not
 * here — they used to be double-counted across fit and CQS. Token matching is
 * word-boundary (via tokenize), not substring, so "ai" no longer matches
 * "brain" and "vc" no longer matches "service".
 */
export function computeKeywordFit(
  profile: Pick<Profile, "profileType" | "bioBlurb">,
  link: { title: string | null; description: string | null },
): number {
  const linkTokens = tokenize(`${link.title ?? ""} ${link.description ?? ""}`);
  if (linkTokens.size === 0) return 50;

  // Distinct profile-type "signals" present in the link. Counting distinct
  // categories hit (rather than raw hits ÷ keyword-list length) means a type
  // with a longer keyword list isn't unfairly diluted. Types with no keywords
  // (e.g. "other") are excluded from the denominator so selecting one can't
  // halve an otherwise-strong match.
  const types = (profile.profileType ?? []).filter(
    (t) => (PROFILE_TYPE_KEYWORDS[t] ?? []).length > 0,
  );
  let typeHits = 0;
  for (const type of types) {
    if (PROFILE_TYPE_KEYWORDS[type].some((kw) => linkTokens.has(kw))) typeHits++;
  }
  const typeScore = types.length > 0 ? (typeHits / types.length) * 100 : 50;

  // Distinctive bio words (>4 chars) that also appear in the link.
  let bioHits = 0;
  for (const w of tokenize(profile.bioBlurb ?? "")) {
    if (w.length > 4 && linkTokens.has(w)) bioHits++;
  }
  const bioBoost = Math.min(bioHits * 5, 20);

  return Math.round(Math.min(100, typeScore * 0.8 + bioBoost));
}

/**
 * Maps a cosine similarity to a 0-100 relevance score. text-embedding-3 puts
 * clearly-related documents around 0.35-0.55 and unrelated ones near 0.1-0.2;
 * the linear rescale spreads that band across the full scale so relevance isn't
 * compressed into the low end. Clamped, so ranking stays sane outside the band.
 * TODO(stage-2): a learned calibration replaces this constant mapping once we
 * have click data.
 */
const COSINE_FLOOR = 0.15;
const COSINE_CEIL = 0.55;
export function semanticRelevance(similarity: number): number {
  const t = (similarity - COSINE_FLOOR) / (COSINE_CEIL - COSINE_FLOOR);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}

// ---- Rule-based boosts (additive, capped, never penalize) --

/** Interest-tag overlap between the profile and the link's tags. */
export function computeInterestBoost(
  profile: Pick<Profile, "interests">,
  tags: string[] | null,
): number {
  const interests = profile.interests ?? [];
  const t = tags ?? [];
  const hits = interests.filter((i) => t.includes(i)).length;
  return Math.min(hits * 10, 20);
}

/** Gender-orientation match (e.g. a womens_focused tag for a "woman" profile). */
export function computeGenderBoost(
  profile: Pick<Profile, "genderIdentity">,
  tags: string[] | null,
): number {
  const tag = profile.genderIdentity ? GENDER_ORIENTATION_TAGS[profile.genderIdentity] : undefined;
  return tag && (tags ?? []).includes(tag) ? 15 : 0;
}

export type LinkScore = {
  /** Final 0-100 rank. */
  score: number;
  /** 0-100 relevance component (semantic or keyword). */
  relevance: number;
  /** 0-100 quality prior (CQS). */
  quality: number;
  /** Additive rule-based boosts folded into the score. */
  boosts: number;
  /** True when semantic relevance was used, false when the keyword fallback was. */
  usedEmbedding: boolean;
};

type ScorableLink = Pick<
  CuratedLink,
  "title" | "description" | "exclusivity" | "format" | "outOfTown" | "tags"
>;

type RankableProfile = Pick<
  Profile,
  "profileType" | "bioBlurb" | "interests" | "genderIdentity"
>;

/**
 * The single discovery-ranking entry point — the homepage, category pages, the
 * profile page, and the weekly digest all call this so their numbers can't
 * drift (they used to). Relevance is semantic when both embeddings are present,
 * otherwise the keyword-fit fallback; quality is always the CQS; interest and
 * gender boosts are additive on top. With no profile the score is pure quality,
 * which is what an anonymous/category browse should rank by.
 */
export function scoreCuratedLink(
  profile: RankableProfile | null,
  link: ScorableLink,
  opts?: { profileEmbedding?: number[] | null; linkEmbedding?: number[] | null },
): LinkScore {
  const quality = computeCurationQualityScore(link);
  if (!profile) {
    return { score: quality, relevance: 0, quality, boosts: 0, usedEmbedding: false };
  }

  const pe = opts?.profileEmbedding;
  const le = opts?.linkEmbedding;
  let relevance: number;
  let usedEmbedding = false;
  if (pe && le && pe.length === le.length) {
    relevance = semanticRelevance(cosineSimilarity(pe, le));
    usedEmbedding = true;
  } else {
    relevance = computeKeywordFit(profile, link);
  }

  const boosts =
    computeInterestBoost(profile, link.tags) + computeGenderBoost(profile, link.tags);
  const base = RELEVANCE_WEIGHT * relevance + QUALITY_WEIGHT * quality;
  const score = Math.round(Math.min(100, Math.max(0, base + boosts)));
  return { score, relevance, quality, boosts, usedEmbedding };
}

/**
 * A short, honest explanation of why a link ranked where it did — a tier word
 * for the score chip and a plain-language reason line for the card. Turns the
 * bare number into "here's why you're seeing this" without over-claiming.
 */
export function describeFit(link: ScorableLink, s: LinkScore): { tier: string; reason: string } {
  const tier =
    s.score >= 85
      ? "Strong fit"
      : s.score >= 70
        ? "Good fit"
        : s.score >= 55
          ? "Fair fit"
          : "Worth a look";

  const reasons: string[] = [];
  if (isTierOneHost(`${link.title ?? ""} ${link.description ?? ""}`)) reasons.push("notable host");
  if (link.exclusivity === "invite_only") reasons.push("invite-only");
  else if (link.format === "dinner") reasons.push("intimate dinner");
  if (s.relevance >= 65) reasons.push("matches your profile");
  if (s.boosts > 0) reasons.push("matches your interests");

  return { tier, reason: reasons.slice(0, 2).join(" · ") };
}
