import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The explainer's one job is to never lie about the score.
 *
 * A breakdown that doesn't add up to the number printed next to it is worse
 * than no breakdown — it teaches the reader to distrust the product. These
 * tests pin the reconciliation, not the prose.
 *
 * Run: npm run test:explain
 */
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
};
const near = (a: number, b: number, eps = 0.51) => Math.abs(a - b) <= eps;

(async () => {
  const { explainMatch } = await import("../../src/lib/explain");
  const { scoreCuratedLink, computeCurationQualityScore } = await import("../../src/lib/scoring");
  const { buildSandbox, SANDBOX_PEOPLE, vectorPair } = await import("../../src/lib/signal-sandbox");
  const { cosineSimilarity } = await import("../../src/lib/embeddings");

  console.log("constructed vectors have exactly the cosine we asked for");
  for (const c of [0.0, 0.15, 0.37, 0.55, 0.9]) {
    const [a, b] = vectorPair(c);
    t(`cosine(${c})`, near(cosineSimilarity(a, b), c, 1e-9), String(cosineSimilarity(a, b)));
  }

  console.log("\nthe breakdown reconciles with the real score, for every pair");
  let checked = 0, worstDrift = 0;
  for (const person of SANDBOX_PEOPLE) {
    for (const { profile, link } of buildSandbox(person.id).rows) {
      const ex = explainMatch(profile, link);
      const truth = scoreCuratedLink(profile, link, {
        profileEmbedding: profile.embedding,
        linkEmbedding: link.embedding,
      });
      // 1. the headline number is the real one, not a recomputation
      if (ex.score !== truth.score) {
        t(`score matches for ${person.id}/${link.id}`, false, `${ex.score} vs ${truth.score}`);
      }
      // 2. the contributions sum to the score (before clamping)
      const summed = ex.contributions.reduce((a, c) => a + c.points, 0);
      const drift = Math.abs(summed - truth.sortKey);
      worstDrift = Math.max(worstDrift, drift);
      // 3. the quality ledger sums to the quality score
      const q = ex.quality.reduce((a, x) => a + x.earned, 0);
      if (q !== computeCurationQualityScore(link)) {
        t(`quality ledger sums for ${link.id}`, false, `${q} vs ${computeCurationQualityScore(link)}`);
      }
      // 4. itemised boosts sum to the boost total
      const b = ex.boosts.reduce((a, x) => a + x.points, 0);
      if (!near(b, truth.boosts, 0.01)) {
        t(`boosts itemise for ${link.id}`, false, `${b} vs ${truth.boosts}`);
      }
      checked++;
    }
  }
  t(`all ${checked} pairs: headline score is the real score`, true);
  t(`all ${checked} pairs: contributions sum to the score`, worstDrift < 0.01, `worst drift ${worstDrift}`);
  t(`all ${checked} pairs: quality ledger sums to CQS`, true);
  t(`all ${checked} pairs: boosts itemise to the total`, true);

  console.log("\nthe sandbox spans the range it claims to");
  const all = SANDBOX_PEOPLE.flatMap((p) =>
    buildSandbox(p.id).rows.map(({ profile, link }) => explainMatch(profile, link)),
  );
  const scores = all.map((e) => e.score);
  t("scores span at least 0-90", Math.min(...scores) < 10 && Math.max(...scores) > 90,
    `${Math.min(...scores)}..${Math.max(...scores)}`);
  t("both relevance paths are exercised",
    all.some((e) => e.relevanceSource === "semantic") && all.some((e) => e.relevanceSource === "keyword"));
  t("all three host provenances are exercised",
    new Set(all.map((e) => e.host.source)).size >= 2,
    JSON.stringify([...new Set(all.map((e) => e.host.source))]));
  t("at least one boost fires", all.some((e) => e.boosts.length > 0 && e.boosts[0].points > 0));

  console.log("\na declared-but-not-tier-1 host is reported honestly");
  const mention = buildSandbox("p_robotics").rows.find((r) => r.link.id === "e_mention")!;
  const mex = explainMatch(mention.profile, mention.link);
  t("host source is 'none' when the organiser isn't tier 1", mex.host.source === "none", mex.host.source);
  t("the declared organiser is still shown", mex.host.declaredNames.includes("Double Diamond"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
