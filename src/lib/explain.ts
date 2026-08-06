import type { curatedLinks, profiles } from "@/db/schema";
import { cosineSimilarity } from "@/lib/embeddings";
import {
  COSINE_BAND,
  SCORE_WEIGHTS,
  explainCurationQuality,
  matchTierOneHostName,
  resolveTierOneHost,
  scoreCuratedLink,
  type QualityComponent,
} from "@/lib/scoring";

type Profile = typeof profiles.$inferSelect;
type CuratedLink = typeof curatedLinks.$inferSelect;

/**
 * Builds a complete, human-readable account of WHY a link scored what it did
 * for a given person.
 *
 * Two rules this module exists to enforce:
 *
 *  1. It never recomputes the score. It calls the real scoreCuratedLink and
 *     reports what came back, so the explanation cannot disagree with the
 *     number shown everywhere else in the product.
 *  2. Every claim is traceable to a value. "Matches your profile" is not an
 *     explanation; "you both list robotics and hardware" is.
 *
 * The genuinely hard part is relevance. It's a cosine between two 1536-dim
 * vectors, and there is no honest way to say "it matched because of word X" —
 * the number is a property of the whole document pair. So rather than invent a
 * cause, this reports the two things that ARE true: the calibration arithmetic
 * that turned the cosine into a 0-100 number, and the concrete overlaps between
 * the two documents, labelled as *context* rather than as the cause.
 */

export type Contribution = {
  key: "relevance" | "quality" | "boosts";
  label: string;
  /** The 0-100 component value before weighting. */
  raw: number;
  /** Multiplier applied in the blend. Boosts are additive, so 1. */
  weight: number;
  /** raw * weight — points this contributed to the final score. */
  points: number;
  /** Most this component could contribute. */
  maxPoints: number;
  explanation: string;
};

export type MatchExplanation = {
  score: number;
  sortKey: number;
  contributions: Contribution[];
  quality: QualityComponent[];
  boosts: { label: string; points: number; detail: string }[];
  /** Concrete things the two sides have in common. Context, not cause. */
  overlap: { interests: string[]; tags: string[]; keywords: string[] };
  host: { key: string | null; declaredNames: string[]; source: "declared" | "inferred" | "none" };
  relevanceSource: "semantic" | "keyword";
  cosine: number | null;
  /** The literal arithmetic, e.g. "0.8 x 62 + 0.2 x 78 + 6 = 71". */
  formula: string;
  /** Clamped at 0 or 100? Worth surfacing — it hides differences. */
  clamped: boolean;
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "this", "that", "from",
  "will", "have", "has", "who", "how", "why", "what", "all", "new", "york", "nyc",
  "join", "come", "event", "night", "week", "day", "time", "get", "one", "out",
  "about", "into", "more", "than", "then", "them", "they", "his", "her", "its",
]);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function explainMatch(
  profile: Profile,
  link: CuratedLink,
): MatchExplanation {
  // The real scorer. Never re-derived.
  const s = scoreCuratedLink(profile, link, {
    profileEmbedding: profile.embedding,
    linkEmbedding: link.embedding,
  });

  const cosine =
    profile.embedding && link.embedding && profile.embedding.length === link.embedding.length
      ? cosineSimilarity(profile.embedding, link.embedding)
      : null;

  const quality = explainCurationQuality(link);
  const hostKey = resolveTierOneHost(link);
  const declaredNames = link.hostNames ?? [];
  const host = {
    key: hostKey,
    declaredNames,
    source: (matchTierOneHostName(declaredNames)
      ? "declared"
      : hostKey
        ? "inferred"
        : "none") as "declared" | "inferred" | "none",
  };

  // ---- overlaps: concrete, checkable common ground ----
  const linkTags = link.tags ?? [];
  const interests = (profile.interests ?? []).filter((i) => linkTags.includes(i));
  const tags = linkTags.filter((t) => (profile.tags ?? []).includes(t));
  const profileWords = words(
    [profile.title, profile.company, profile.bioBlurb, (profile.interests ?? []).join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  const linkWords = words(`${link.title ?? ""} ${link.description ?? ""}`);
  const keywords = [...profileWords].filter((w) => linkWords.has(w)).slice(0, 12);

  // ---- boosts, itemised ----
  const boosts: MatchExplanation["boosts"] = [];
  if (interests.length) {
    boosts.push({
      label: "Shared interests",
      points: 0, // filled below from the residual so it always reconciles
      detail: interests.map(titleCase).join(", "),
    });
  }
  // The scorer returns boosts as one number; attribute it rather than recompute
  // the rules, so this can't drift. When only one rule fired, it gets all of it.
  if (s.boosts > 0) {
    if (boosts.length === 1) boosts[0].points = s.boosts;
    else if (boosts.length === 0)
      boosts.push({
        label: "Profile boosts",
        points: s.boosts,
        detail: "orientation or tag rules matched",
      });
    else {
      const each = s.boosts / boosts.length;
      boosts.forEach((b) => (b.points = each));
    }
  }

  // Uses the UNROUNDED relevance, so the printed equation reproduces the score
  // exactly rather than drifting by up to 0.4 points.
  const relPoints = SCORE_WEIGHTS.relevance * s.relevancePrecise;
  const qualPoints = SCORE_WEIGHTS.quality * s.quality;

  const contributions: Contribution[] = [
    {
      key: "relevance",
      label: "Match to you",
      raw: s.relevance,
      weight: SCORE_WEIGHTS.relevance,
      points: relPoints,
      maxPoints: SCORE_WEIGHTS.relevance * 100,
      explanation: s.usedEmbedding
        ? `How close this event's meaning sits to your profile's. A similarity of ${cosine?.toFixed(3) ?? "?"} is mapped onto 0-100 across the band ${COSINE_BAND.floor}-${COSINE_BAND.ceil}, where real pairs actually fall.`
        : "No AI vector was available for one side, so this fell back to counting shared words and tags. Less accurate.",
    },
    {
      key: "quality",
      label: "Event quality",
      raw: s.quality,
      weight: SCORE_WEIGHTS.quality,
      points: qualPoints,
      maxPoints: SCORE_WEIGHTS.quality * 100,
      explanation:
        "Serena's editorial bar — host, exclusivity, format, locality, room size. Identical for every person, which is why it's weighted low: it can't tell two people apart.",
    },
    {
      key: "boosts",
      label: "Boosts",
      raw: s.boosts,
      weight: 1,
      points: s.boosts,
      maxPoints: 35,
      explanation:
        "Added on top, never subtracted. Shared interest tags (up to 20) and an orientation match (15).",
    },
  ];

  const total = relPoints + qualPoints + s.boosts;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return {
    score: s.score,
    sortKey: s.sortKey,
    contributions,
    quality,
    boosts,
    overlap: { interests, tags, keywords },
    host,
    relevanceSource: s.usedEmbedding ? "semantic" : "keyword",
    cosine,
    formula: `${SCORE_WEIGHTS.relevance} × ${fmt(s.relevancePrecise)} + ${SCORE_WEIGHTS.quality} × ${s.quality}${s.boosts ? ` + ${fmt(s.boosts)}` : ""} = ${fmt(total)}`,
    clamped: total > 100 || total < 0,
  };
}
