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

const PROFILE_TYPE_KEYWORDS: Record<(typeof profileTypeEnum)[number], string[]> = {
  founder: [
    "founder", "founders", "startup", "startups", "ceo", "entrepreneur",
    "venture", "vc", "demo day", "pitch", "builders", "tech", "network",
    "networking", "mixer", "community", "industry",
  ],
  operator: ["operator", "operators", "ops", "growth", "gtm", "go-to-market"],
  investor: ["investor", "investors", "vc", "venture", "fund", "capital", "angel"],
  engineer: [
    "engineer", "engineers", "developer", "technical", "hackathon", "build",
    "ai", "code", "hardware", "demo",
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
 */
const TIER_ONE_HOSTS = [
  "union square",
  "primary",
  "mark gamma",
  "tekakon",
  "sierra",
  "anthropic",
  "openai",
  "granola",
  "notion",
  "brazel",
  "andrew young",
  "andru yeung",
  "andrew yeung",
  "yonas",
  "the collective",
  "versi",
  // Added from the April–July curation audit:
  "replit",
  "revenuecat",
  "y combinator",
  " yc ",
  "nvidia",
  "antler",
  "vercel",
  "stripe",
  "elevenlabs",
  "databricks",
  "mercury",
  "first round",
  "m13",
  "mongodb",
  "shopify",
  "cursor",
  "ramp",
  "spc",
  "modal",
  "datadog",
  "google deepmind",
  "microsoft",
  "aws",
  "tiktok",
  "brex",
  "firstmark",
  "gamma",
  "speedrun",
  "hubspot",
  "suno",
  "flybridge",
  "xai",
  "runway",
  "columbia university",
  "bergdorf goodman",
  "lvmh",
];

/** True if the given preview text mentions a recognized tier-1 host. */
function isTierOneHost(text: string): boolean {
  return TIER_ONE_HOSTS.some((host) => text.toLowerCase().includes(host));
}

/** Extracts an attendee count from scraped preview text, if present (e.g. Luma's "N attending"). */
function extractAttendeeCount(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:people\s+)?attending/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Lightweight, no-AI-call fit score for a curated (external) link against a
 * profile — keyword overlap between profile type / bio and the link's own
 * title + description, plus Serena's discovery signals (tier-1 host,
 * smaller/more-private events score higher). Deliberately cheap so it can
 * run per-link on every page render without an LLM call in the critical
 * path. Lower-fidelity than event applicant scoring by design — there's no
 * resume, no brief, no host-defined rubric, just scraped preview text.
 */
export function computeLinkFitScore(
  profile: Pick<Profile, "profileType" | "bioBlurb" | "genderIdentity" | "interests"> | null,
  link: { title: string | null; description: string | null; tags?: string[] | null },
): number {
  const text = `${link.title ?? ""} ${link.description ?? ""}`.toLowerCase();

  let base = 50;
  if (profile?.profileType?.length) {
    let keywordHits = 0;
    let keywordTotal = 0;
    for (const type of profile.profileType) {
      const keywords = PROFILE_TYPE_KEYWORDS[type] ?? [];
      keywordTotal += keywords.length;
      keywordHits += keywords.filter((kw) => text.includes(kw)).length;
    }
    const typeScore = keywordTotal > 0 ? (keywordHits / keywordTotal) * 100 : 50;

    const bioWords = (profile.bioBlurb ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4);
    const bioHits = bioWords.filter((w) => text.includes(w)).length;
    const bioBoost = Math.min(bioHits * 5, 20);

    base = typeScore * 0.8 + bioBoost;
  }

  const hostBoost = isTierOneHost(text) ? 15 : 0;

  const attendeeCount = extractAttendeeCount(text);
  let sizeAdjustment = 0;
  if (attendeeCount !== null) {
    if (attendeeCount <= 50) sizeAdjustment = 10;
    else if (attendeeCount >= 150) sizeAdjustment = -15;
  }

  const tags = link.tags ?? [];
  const interestHits = (profile?.interests ?? []).filter((i) => tags.includes(i)).length;
  const interestBoost = Math.min(interestHits * 10, 20);

  const orientationTag = profile?.genderIdentity
    ? GENDER_ORIENTATION_TAGS[profile.genderIdentity]
    : undefined;
  const genderBoost = orientationTag && tags.includes(orientationTag) ? 15 : 0;

  return Math.round(
    Math.min(100, Math.max(0, base + hostBoost + sizeAdjustment + interestBoost + genderBoost)),
  );
}

const HOST_TIER_POINTS = { unknown: 0, tier_1: 40 };
const EXCLUSIVITY_POINTS = { open: 5, capped: 15, invite_only: 25 };
const FORMAT_POINTS = {
  expo: 5,
  mixer: 10,
  workshop: 15,
  hackathon: 15,
  dinner: 20,
};
const LOCALITY_POINTS = { out_of_town: 0, nyc: 15 };

type CuratedLink = typeof curatedLinks.$inferSelect;

/**
 * Deterministic 0-100 "how good is this listing" score for a curated link,
 * independent of any one visitor's profile — the April–July curation audit
 * (playbooks/event-registrant-scoring.md) found host prestige, exclusivity,
 * format, and locality already implicitly drove which links got curated at
 * all. This makes that judgment explicit so it can order a category tile
 * before a visitor has a profile, and blend with personal fit once they do.
 */
export function computeCurationQualityScore(
  link: Pick<CuratedLink, "title" | "description" | "exclusivity" | "format" | "outOfTown">,
): number {
  const text = `${link.title ?? ""} ${link.description ?? ""}`;
  const hostPoints = isTierOneHost(text) ? HOST_TIER_POINTS.tier_1 : HOST_TIER_POINTS.unknown;
  const exclusivityPoints = EXCLUSIVITY_POINTS[link.exclusivity];
  const formatPoints = FORMAT_POINTS[link.format];
  const localityPoints = link.outOfTown ? LOCALITY_POINTS.out_of_town : LOCALITY_POINTS.nyc;

  return hostPoints + exclusivityPoints + formatPoints + localityPoints;
}

/** Same 60/40 split computeCompositeScore uses for structural/semantic. */
export function computeBlendedLinkScore(personalFit: number, curationQuality: number): number {
  return Math.round(0.6 * personalFit + 0.4 * curationQuality);
}
