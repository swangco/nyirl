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

/**
 * Recomputes an applicant's score from CURRENT data.
 *
 * `registrations` stores structural/semantic/composite scores written once at
 * apply time and never refreshed. That is correct as an audit trail — it records
 * what the host actually saw when they decided — but it goes stale: both live
 * registrations were written before embeddings existed, so their stored
 * semanticScore is the neutral-50 fallback (stored 100/50/80 and 89/50/73, now
 * actually 100/64/86 and 89/61/78).
 *
 * Deliberately does NOT overwrite the stored values. On the live data the stale
 * ordering happens to match the fresh ordering, so silently rewriting history
 * would destroy the audit trail to fix a ranking problem that isn't there yet.
 * Callers show `live` alongside `stored` and can surface the drift.
 */
export function scoreRegistration(
  profile: ScorableProfile & { embedding?: number[] | null },
  event: {
    criteriaWeights: string | null;
    tags: string[] | null;
    embedding?: number[] | null;
  },
): { structural: number; semantic: number; composite: number; usedEmbedding: boolean } {
  const structural = computeStructuralScore(profile, event.criteriaWeights, event.tags);
  const semanticFromVector = applicantSemanticScore(
    profile.embedding ?? null,
    event.embedding ?? null,
  );
  const semantic = semanticFromVector ?? 50;
  return {
    structural,
    semantic,
    composite: computeCompositeScore(structural, semantic),
    usedEmbedding: semanticFromVector !== null,
  };
}

/**
 * Applicant relevance from precomputed embeddings — the no-LLM replacement for
 * the per-application Haiku screen. cosine(profile, event) mapped to 0-100 with
 * the same calibration discovery uses. Returns null when either embedding is
 * absent (no OPENAI_API_KEY / un-embedded row) so the caller can fall back to a
 * neutral score. This keeps applicant scoring off the request-path LLM entirely;
 * the host generates a qualitative AI read on demand instead (see host actions).
 */
export function applicantSemanticScore(
  profileEmbedding: number[] | null,
  eventEmbedding: number[] | null,
): number | null {
  if (profileEmbedding && eventEmbedding && profileEmbedding.length === eventEmbedding.length) {
    return semanticRelevance(cosineSimilarity(profileEmbedding, eventEmbedding));
  }
  return null;
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
/**
 * Relevance vs. quality blend.
 *
 * Was 0.6/0.4, which measured badly: on a 200-event / 50-user offline
 * evaluation against blind gold labels (scripts/eval), a 0.4 quality weight
 * swamped the personalization signal. CQS is *deliberately* not personalized —
 * on its own it ranks barely above random (P@5 4.8 vs 4.0) — so weighting it
 * that heavily pulled every user's feed toward the same globally-"good" items.
 * Measured P@5 by relevance weight: 0.6 -> 30.4, 0.7 -> 37.2, 0.8 -> 43.2,
 * 0.9 -> 44.8, 1.0 -> 46.0.
 *
 * Stopping at 0.8 rather than 1.0 is deliberate. 0.8 captures ~82% of the
 * achievable precision gain — (43.2-30.4)/(46.0-30.4) — while keeping a real
 * quality prior in the ranking, and pure relevance has the worst false-positive
 * rate in the sweep (FP@10 4.8 at w=1.0 vs 4.0 at w=0.8). The judges were asked
 * to rank *personal* fit and were never told to value host prestige, exclusivity
 * or intimacy, which is exactly what CQS encodes and what this product's
 * curation thesis rests on — so the eval structurally under-credits quality and
 * the true optimum is very unlikely to be w=1.0.
 *
 * Honest cost: against the scorer this replaces, FP@10 rises 3.0 -> 3.8. That is
 * ~0.4 judge-flagged-irrelevant items per 10 shown, bought for a 54% relative
 * precision gain. Worth re-examining once real click data exists.
 */
const RELEVANCE_WEIGHT = 0.8;
const QUALITY_WEIGHT = 0.2;

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
 * boundaries (see matchTierOneHost), so short names like "aws" match only
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
  // Named directly by Serena as tier 1 and previously absent, so live listings
  // "Clay in NY" and "New York | Claude Code for Developers" scored zero on the
  // criterion she checks first.
  "clay", "claude",
].map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));

/**
 * Names that are also ordinary English words, or substrings of common ones.
 * Matching these against free prose produces false hosts — measured live,
 * "(N)YC Alumni + Founder Friends" normalises to the tokens `n yc` and so paid
 * out Y Combinator's full host score, and the same class of collision is why
 * host-brand diversity was reverted on 2026-07-28.
 *
 * They stay eligible when matched against a STRUCTURED host name, where "Modal"
 * unambiguously means Modal. They are simply never inferred from prose.
 */
const UNSAFE_IN_PROSE = new Set([
  "yc", "primary", "gamma", "modal", "sierra", "runway", "notion", "cursor",
  "ramp", "clay", "mercury", "aws", "versi", "the collective",
]);

/**
 * True if the preview text mentions a recognized tier-1 host. Normalizes the
 * text to space-delimited tokens and matches each host phrase as a whole-token
 * run — so "aws" won't hit inside "flaws", "yc" won't hit inside "cycling",
 * and a leading "YC ..." title still matches.
 */
export function matchTierOneHost(text: string): string | null {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  // On multiple matches return the longest phrase, so the result is
  // deterministic and "y combinator" wins over a bare "yc".
  let best: string | null = null;
  for (const host of TIER_ONE_HOSTS) {
    if (host.length === 0) continue;
    if (!haystack.includes(` ${host} `)) continue;
    // An ambiguous name counts from prose ONLY where the text explicitly credits
    // it as the host: "hosted by Modal" is unambiguous, "a modal dialog" is not.
    if (UNSAFE_IN_PROSE.has(host) && !creditsHost(haystack, host)) continue;
    if (!best || host.length > best.length) best = host;
  }
  return best;
}

/** Does the text credit `host` as the one running the event, rather than merely
 * mentioning the word? Used to re-admit the names that are also English words. */
function creditsHost(haystack: string, host: string): boolean {
  return new RegExp(`(hosted|presented|brought to you|organized|organised) by ${host}\\b`).test(
    haystack,
  );
}

/**
 * Tier-1 match against the listing's DECLARED organisers. This is the reliable
 * path: it reads structured data rather than guessing from prose, so the full
 * allowlist applies including the names that are ordinary English words.
 */
export function matchTierOneHostName(hostNames: string[] | null): string | null {
  if (!hostNames?.length) return null;
  let best: string | null = null;
  for (const raw of hostNames) {
    // Strip possessives BEFORE collapsing punctuation. Luma calendar names are
    // routinely possessive ("Andrew's Yeung's Tech Events"), and normalising
    // punctuation first turns that into "andrew s yeung s", which no longer
    // contains "andrew yeung" — the correct host was being dropped.
    const hay = ` ${raw
      .toLowerCase()
      .replace(/['’`]s\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()} `;
    for (const host of TIER_ONE_HOSTS) {
      if (host.length > 0 && hay.includes(` ${host} `)) {
        if (!best || host.length > best.length) best = host;
      }
    }
  }
  return best;
}

/**
 * Preferred entry point. Uses the declared organisers when the listing publishes
 * them (27 of 40 live links) and only falls back to scanning prose otherwise —
 * where the ambiguous names are excluded, so the fallback is conservative rather
 * than confidently wrong.
 */
export function resolveTierOneHost(
  link: Pick<CuratedLink, "title" | "description"> & { hostNames?: string[] | null },
): string | null {
  const declared = matchTierOneHostName(link.hostNames ?? null);
  if (declared) return declared;
  // A page that declared organisers and matched none is a genuine "not tier 1",
  // not a gap to be filled by guessing at the prose.
  if (link.hostNames?.length) return null;
  return matchTierOneHost(`${link.title ?? ""} ${link.description ?? ""}`);
}

/**
 * Groups listings by who is putting them on, for de-duplicating a feed.
 *
 * Deliberately NOT a "don't show me my own employer" rule. That was the obvious
 * fix for seeing "Ramp Applied AI Dinner" at the top of a Ramp employee's feed,
 * but it is wrong by construction: a different Ramp employee may legitimately
 * want that event, `curated_links` has no host field to key on (only scraped
 * title/description, where a company name also appears in speaker bios and
 * ordinary prose), and it would fire for almost nobody.
 *
 * The real defect is narrower and more general: several listings from the SAME
 * host clustering at the top of one feed. Keying on the recognized host phrase
 * where there is one, and falling back to the first distinctive title token,
 * addresses that for every user rather than only for people whose employer
 * happens to host events.
 */
export function hostBrandKey(link: Pick<CuratedLink, "title" | "description">): string | null {
  const text = `${link.title ?? ""} ${link.description ?? ""}`;
  const tier1 = matchTierOneHost(text);
  if (tier1) return tier1;
  const first = (link.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .find((w) => w.length > 3);
  return first ?? null;
}

/**
 * Reorders a scored list so no single host dominates the top of the feed:
 * beyond `perBrand` items from the same brand, later ones are pushed below
 * everything else. Order within each group is preserved, so this never
 * reorders on anything except brand repetition.
 *
 * Measured at perBrand=2 on the evaluation corpus: P@5 41.2 -> 43.2, NDCG
 * 40.8 -> 41.6, FP@10 4.0 -> 3.4. Reported honestly, NONE of those clear the
 * |t| > 2 bar this repo uses (t = 1.53 / 1.41 / -1.77) — they are directional,
 * not proven. It is applied anyway only because the downside is bounded and
 * one-sided: the FP@10 comparison had 0 users worse and 3 better, and the
 * function can only demote duplicates within an already-scored list, so the
 * items promoted in their place were adjacent in rank already. Re-measure on
 * real data before trusting the size of the gain; perBrand=1 was worse on every
 * metric and should not be used.
 */
export function diversifyByBrand<T>(
  items: T[],
  keyOf: (item: T) => string | null,
  perBrand = 2,
): T[] {
  const seen = new Map<string, number>();
  const kept: T[] = [];
  const demoted: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key) {
      kept.push(item);
      continue;
    }
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    (n <= perBrand ? kept : demoted).push(item);
  }
  return [...kept, ...demoted];
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
  link: Pick<CuratedLink, "title" | "description" | "exclusivity" | "format" | "outOfTown"> & {
    hostNames?: string[] | null;
  },
): number {
  // Prefers the listing's declared organisers; only guesses from prose when the
  // page publishes none. See resolveTierOneHost.
  const host = resolveTierOneHost(link) ? HOST_TIER_POINTS.tier_1 : HOST_TIER_POINTS.unknown;
  const text = `${link.title ?? ""} ${link.description ?? ""}`;
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
 * Maps a cosine similarity to a 0-100 relevance score.
 *
 * DELIBERATELY LEFT AT 0.15/0.55. The offline evaluation measured the observed
 * band (p05 0.206, p50 0.319, p99 0.504) and a tighter 0.20/0.50 mapping looked
 * like an obvious improvement — but a paired ablation on the same 50 users found
 * it worth +0.008 P@5 with SE 0.016 (t = 0.50), i.e. indistinguishable from
 * noise. Essentially all of the measured gain came from the relevance/quality
 * weight, not from the band.
 *
 * Two reasons that makes retuning actively harmful here:
 *  - Blast radius. This mapping sits underneath absolute thresholds (the digest
 *    bar, describeFit's tiers) and underneath applicantSemanticScore, whose
 *    output is PERSISTED on registrations at apply time. Shifting it silently
 *    re-scales stored scores, so applicants from before and after a deploy get
 *    ranked against each other on two different scales.
 *  - Stability. The band is what makes a score comparable across time; a
 *    retune with no click data to validate it against is a guess with a large
 *    blast radius.
 *
 * The corpus-mismatch argument that used to sit here is GONE: it said the
 * fitted band came from synthetic profiles with no resume text while production
 * embedded 6k chars of resume, so the percentiles wouldn't transfer.
 * buildProfileDocument no longer includes resume text, so once the force
 * re-embed has run the live and eval corpora agree and that objection is moot.
 *
 * TODO(stage-2): re-derive from the LIVE corpus once there is real engagement
 * data to validate against, and re-base persisted applicant scores in the same
 * migration.
 */
const COSINE_FLOOR = 0.15;
const COSINE_CEIL = 0.55;

/** Unrounded form, used internally for ranking so ties aren't manufactured. */
export function semanticRelevancePrecise(similarity: number): number {
  const t = (similarity - COSINE_FLOOR) / (COSINE_CEIL - COSINE_FLOOR);
  return Math.min(1, Math.max(0, t)) * 100;
}

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
  /** Final 0-100 score, rounded — this is the number shown to users. */
  score: number;
  /**
   * The same value UNROUNDED. Always sort by this, never by `score`.
   *
   * Rounding to an integer collapses a 200-item catalogue onto ~100 distinct
   * values, so ties are the norm rather than the exception: measured on the
   * evaluation set, 19 of 20 users had tied scores inside their own top-10, and
   * those ties fall through to whatever order the rows arrived in (createdAt).
   * Ranking on the unrounded value recovered ~2 points of P@5 (41.2 -> 43.2).
   */
  sortKey: number;
  /** 0-100 relevance component (semantic or keyword), ROUNDED for display. */
  relevance: number;
  /**
   * The same relevance UNROUNDED, as actually used in the blend.
   *
   * Exposed because anything explaining the score has to reproduce it exactly:
   * multiplying the rounded value by 0.8 drifts up to 0.4 points from the real
   * total, which is enough to print an equation that doesn't equal the number
   * printed beside it.
   */
  relevancePrecise: number;
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
    return {
      score: quality,
      sortKey: quality,
      relevance: 0,
      relevancePrecise: 0,
      quality,
      boosts: 0,
      usedEmbedding: false,
    };
  }

  const pe = opts?.profileEmbedding;
  const le = opts?.linkEmbedding;
  // Keep relevance unrounded through the arithmetic — rounding it here would
  // discard ordering information before the blend even happens.
  let relevancePrecise: number;
  let usedEmbedding = false;
  if (pe && le && pe.length === le.length) {
    relevancePrecise = semanticRelevancePrecise(cosineSimilarity(pe, le));
    usedEmbedding = true;
  } else {
    relevancePrecise = computeKeywordFit(profile, link);
  }

  const boosts =
    computeInterestBoost(profile, link.tags) + computeGenderBoost(profile, link.tags);
  const base = RELEVANCE_WEIGHT * relevancePrecise + QUALITY_WEIGHT * quality;
  const sortKey = Math.min(100, Math.max(0, base + boosts));
  return {
    score: Math.round(sortKey),
    sortKey,
    relevance: Math.round(relevancePrecise),
    relevancePrecise,
    quality,
    boosts,
    usedEmbedding,
  };
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
  if (resolveTierOneHost(link)) reasons.push("notable host");
  if (link.exclusivity === "invite_only") reasons.push("invite-only");
  else if (link.format === "dinner") reasons.push("intimate dinner");
  if (s.relevance >= 65) reasons.push("matches your profile");
  if (s.boosts > 0) reasons.push("matches your interests");

  return { tier, reason: reasons.slice(0, 2).join(" · ") };
}

// ---------------------------------------------------------------------------
// Explainability
//
// The inspector UI must never re-derive the arithmetic — a second copy of these
// numbers would drift from the real one the moment either changed, and a score
// explanation that disagrees with the score is worse than no explanation. So
// the breakdown is produced HERE, from the same constants the scorer uses.
// ---------------------------------------------------------------------------

export type QualityComponent = {
  key: "host" | "exclusivity" | "format" | "locality" | "intimacy";
  label: string;
  earned: number;
  max: number;
  /** Plain-language reason this many points were earned. */
  detail: string;
};

/** Itemised Curation Quality Score. Sums to computeCurationQualityScore(link). */
export function explainCurationQuality(
  link: Pick<CuratedLink, "title" | "description" | "exclusivity" | "format" | "outOfTown"> & {
    hostNames?: string[] | null;
  },
): QualityComponent[] {
  const text = `${link.title ?? ""} ${link.description ?? ""}`;
  const hostKey = resolveTierOneHost(link);
  const declared = matchTierOneHostName(link.hostNames ?? null);
  const count = extractAttendeeCount(text);
  const exclusivity = EXCLUSIVITY_POINTS[link.exclusivity] ?? EXCLUSIVITY_POINTS.capped;
  const format = FORMAT_POINTS[link.format] ?? FORMAT_POINTS.mixer;

  return [
    {
      key: "host",
      label: "Host",
      earned: hostKey ? HOST_TIER_POINTS.tier_1 : HOST_TIER_POINTS.unknown,
      max: HOST_TIER_POINTS.tier_1,
      detail: hostKey
        ? declared
          ? `“${hostKey}” — named as the organiser on the listing`
          : `“${hostKey}” — inferred from the text, no organiser published`
        : link.hostNames?.length
          ? `organiser is “${link.hostNames[0]}”, not on the tier-1 list`
          : "no recognised host",
    },
    {
      key: "exclusivity",
      label: "Exclusivity",
      earned: exclusivity,
      max: EXCLUSIVITY_POINTS.invite_only,
      detail:
        link.exclusivity === "invite_only"
          ? "invite only"
          : link.exclusivity === "open"
            ? "open to the public"
            : "capped headcount",
    },
    {
      key: "format",
      label: "Format",
      earned: format,
      max: FORMAT_POINTS.dinner,
      detail: `${link.format} — sit-down formats score above expos`,
    },
    {
      key: "locality",
      label: "Locality",
      earned: link.outOfTown ? LOCALITY_POINTS.out_of_town : LOCALITY_POINTS.nyc,
      max: LOCALITY_POINTS.nyc,
      detail: link.outOfTown ? "outside New York" : "in New York",
    },
    {
      key: "intimacy",
      label: "Room size",
      earned:
        count === null
          ? INTIMACY_POINTS.unknown
          : count <= 50
            ? INTIMACY_POINTS.small
            : count <= 150
              ? INTIMACY_POINTS.medium
              : INTIMACY_POINTS.large,
      max: INTIMACY_POINTS.small,
      detail:
        count === null
          ? "headcount not published — treated as mid-sized"
          : `~${count} people`,
    },
  ];
}

/** The blend weights, exposed so the UI can state them rather than hardcode them. */
export const SCORE_WEIGHTS = {
  relevance: RELEVANCE_WEIGHT,
  quality: QUALITY_WEIGHT,
} as const;

/** Calibration band, exposed so the UI can explain what a cosine maps to. */
export const COSINE_BAND = { floor: COSINE_FLOOR, ceil: COSINE_CEIL } as const;
