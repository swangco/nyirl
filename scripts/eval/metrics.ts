/**
 * Information-retrieval metrics for the recommender evaluation.
 *
 * The gold standard for each user is a *ranked* top-10 from a blind judge plus
 * an explicit "clearly irrelevant" set. That shape lets us measure three
 * different failure modes separately:
 *   - precision/recall: are we surfacing the right things at all?
 *   - NDCG:             are we surfacing them in the right ORDER?
 *   - false positives:  are we surfacing things a human called actively wrong?
 * The last one matters most for a curation product — a bad pick in the top 5
 * costs more trust than a good pick ranked 6th instead of 2nd.
 */

/** Graded gain from a gold rank: #1 is worth 10, #10 is worth 1, unranked 0. */
function gain(id: string, goldRanked: string[]): number {
  const i = goldRanked.indexOf(id);
  return i === -1 ? 0 : goldRanked.length - i;
}

export function precisionAtK(ranked: string[], goldSet: Set<string>, k: number): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((id) => goldSet.has(id)).length / top.length;
}

export function recallAtK(ranked: string[], goldSet: Set<string>, k: number): number {
  if (goldSet.size === 0) return 0;
  return ranked.slice(0, k).filter((id) => goldSet.has(id)).length / goldSet.size;
}

export function ndcgAtK(ranked: string[], goldRanked: string[], k: number): number {
  const dcg = ranked
    .slice(0, k)
    .reduce((sum, id, i) => sum + gain(id, goldRanked) / Math.log2(i + 2), 0);
  const idcg = goldRanked
    .slice(0, k)
    .reduce((sum, id, i) => sum + gain(id, goldRanked) / Math.log2(i + 2), 0);
  return idcg === 0 ? 0 : dcg / idcg;
}

/** Reciprocal rank of the first genuinely-good hit. Rewards getting the very
 * top of the list right, which is what a user actually sees first. */
export function mrr(ranked: string[], goldSet: Set<string>): number {
  for (let i = 0; i < ranked.length; i++) {
    if (goldSet.has(ranked[i])) return 1 / (i + 1);
  }
  return 0;
}

/** Fraction of our top-k that the judge explicitly flagged as wrong to show. */
export function falsePositiveAtK(
  ranked: string[],
  irrelevantSet: Set<string>,
  k: number,
): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((id) => irrelevantSet.has(id)).length / top.length;
}

export type Metrics = {
  p5: number;
  p10: number;
  recall10: number;
  ndcg10: number;
  mrr: number;
  fp10: number;
};

export function evaluate(
  ranked: string[],
  goldRanked: string[],
  irrelevant: string[],
): Metrics {
  const goldSet = new Set(goldRanked);
  const irrSet = new Set(irrelevant);
  return {
    p5: precisionAtK(ranked, goldSet, 5),
    p10: precisionAtK(ranked, goldSet, 10),
    recall10: recallAtK(ranked, goldSet, 10),
    ndcg10: ndcgAtK(ranked, goldRanked, 10),
    mrr: mrr(ranked, goldSet),
    fp10: falsePositiveAtK(ranked, irrSet, 10),
  };
}

export function meanMetrics(all: Metrics[]): Metrics {
  const n = all.length || 1;
  const sum = (f: (m: Metrics) => number) => all.reduce((s, m) => s + f(m), 0) / n;
  return {
    p5: sum((m) => m.p5),
    p10: sum((m) => m.p10),
    recall10: sum((m) => m.recall10),
    ndcg10: sum((m) => m.ndcg10),
    mrr: sum((m) => m.mrr),
    fp10: sum((m) => m.fp10),
  };
}

export function formatRow(label: string, m: Metrics): string {
  const pct = (x: number) => (x * 100).toFixed(1).padStart(5);
  return `${label.padEnd(30)} ${pct(m.p5)} ${pct(m.p10)} ${pct(m.recall10)} ${pct(m.ndcg10)} ${pct(m.mrr)} ${pct(m.fp10)}`;
}

export const METRICS_HEADER =
  `${"variant".padEnd(30)} ${"P@5".padStart(5)} ${"P@10".padStart(5)} ${"R@10".padStart(5)} ${"NDCG".padStart(5)} ${"MRR".padStart(5)} ${"FP@10".padStart(5)}`;
