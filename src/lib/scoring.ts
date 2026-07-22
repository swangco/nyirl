import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { founderStageEnum, profiles, profileTypeEnum } from "@/db/schema";

type Profile = typeof profiles.$inferSelect;

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
};

type ScorableProfile = Pick<
  Profile,
  | "profileType"
  | "resumeUrl"
  | "bioBlurb"
  | "stage"
  | "fundingRaised"
  | "checksWritten"
>;

/** Deterministic 0-100 score from the host's weighted rubric. Pure function, no I/O. */
export function computeStructuralScore(
  profile: ScorableProfile,
  criteriaWeightsJson: string | null,
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
  founder: ["founder", "startup", "ceo", "entrepreneur", "founders"],
  operator: ["operator", "ops", "growth", "gtm"],
  investor: ["investor", "vc", "venture", "fund", "capital"],
  engineer: ["engineer", "developer", "technical", "hackathon", "build", "ai", "code"],
  marketing_gtm: ["marketing", "growth", "gtm", "brand"],
  job_seeking: ["hiring", "job", "career", "recruiting"],
  other: [],
};

/**
 * Recognized tier-1 hosts (Serena's actual discovery criteria, captured
 * July 22, 2026 — see playbooks/event-registrant-scoring.md in the
 * knowledge graph for the full reasoning). Deliberately a narrow,
 * growable allowlist: a host NOT on this list gets no penalty, only no
 * boost — guessing at reputation for an unrecognized name is worse than
 * an incomplete list.
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
];

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
  profile: Pick<Profile, "profileType" | "bioBlurb"> | null,
  link: { title: string | null; description: string | null },
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

  const isTierOneHost = TIER_ONE_HOSTS.some((host) => text.includes(host));
  const hostBoost = isTierOneHost ? 15 : 0;

  const attendeeCount = extractAttendeeCount(text);
  let sizeAdjustment = 0;
  if (attendeeCount !== null) {
    if (attendeeCount <= 50) sizeAdjustment = 10;
    else if (attendeeCount >= 150) sizeAdjustment = -15;
  }

  return Math.round(Math.min(100, Math.max(0, base + hostBoost + sizeAdjustment)));
}
