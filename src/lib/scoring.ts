import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { profiles, profileTypeEnum } from "@/db/schema";

type Profile = typeof profiles.$inferSelect;

type ProfileTypeCriterion = {
  weight: number;
  target_types?: (typeof profileTypeEnum)[number][];
  adjacent_types?: (typeof profileTypeEnum)[number][];
};

type CriteriaWeights = {
  profile_type_match?: ProfileTypeCriterion;
  profile_completeness?: { weight: number };
};

/** Deterministic 0-100 score from the host's weighted rubric. Pure function, no I/O. */
export function computeStructuralScore(
  profile: Pick<Profile, "profileType" | "resumeUrl" | "bioBlurb">,
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
 * Lightweight, no-AI-call fit score for a curated (external) link against a
 * profile — keyword overlap between profile type / bio and the link's own
 * title + description. Deliberately cheap so it can run per-link on every
 * page render without an LLM call in the critical path.
 */
export function computeLinkFitScore(
  profile: Pick<Profile, "profileType" | "bioBlurb"> | null,
  link: { title: string | null; description: string | null },
): number {
  if (!profile || !profile.profileType?.length) return 50; // no signal — neutral

  const text = `${link.title ?? ""} ${link.description ?? ""}`.toLowerCase();

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

  return Math.round(Math.min(100, typeScore * 0.8 + bioBoost));
}
