import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { EmbedCache, contentKey } from "./cache";
import { METRICS_HEADER, evaluate, formatRow, meanMetrics, type Metrics } from "./metrics";

/**
 * Offline evaluation of the discovery recommender against blind human-style
 * gold labels. Measures the real production scoring functions — not a
 * reimplementation — so a win here is a win in the app.
 *
 * Run:  npx tsx scripts/eval/run.ts [--dims 1536|512] [--sweep]
 */

const DIR = ".context/recsys-eval";
const MODEL = "text-embedding-3-small";

type SynthEvent = {
  id: string;
  title: string;
  description: string;
  category: string;
  format: string;
  exclusivity: string;
  outOfTown: boolean;
  tags: string[];
  hostName: string;
};

type SynthUser = {
  id: string;
  fullName: string;
  title: string;
  company: string;
  profileType: string[];
  bioBlurb: string;
  interests: string[];
  stage: string | null;
  fundingRaised: string | null;
  checksWritten: number | null;
};

type Gold = { userId: string; top10: string[]; irrelevant: string[]; rationale: string };

function loadAll<T>(prefix: string): T[] {
  const files = readdirSync(DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
  const out: T[] = [];
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
    if (Array.isArray(parsed)) out.push(...parsed);
  }
  return out;
}

/** Host name lives in the listing text in production (scraped Luma titles), so
 * fold it in the same way — this is what exercises the tier-1 host detection. */
function linkShape(e: SynthEvent) {
  return {
    title: e.title,
    description: `${e.description} Hosted by ${e.hostName}.`,
    category: e.category as never,
    format: e.format as never,
    exclusivity: e.exclusivity as never,
    outOfTown: e.outOfTown,
    tags: e.tags ?? [],
  };
}

function profileShape(u: SynthUser) {
  return {
    fullName: u.fullName,
    title: u.title,
    company: u.company,
    profileType: (u.profileType ?? []) as never,
    bioBlurb: u.bioBlurb,
    interests: (u.interests ?? []) as never,
    tags: null,
    resumeTextExtracted: null,
    genderIdentity: null,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const dims = Number(argv.find((a, i) => argv[i - 1] === "--dims") ?? 1536);
  const sweep = argv.includes("--sweep");

  const { createOpenAI } = await import("@ai-sdk/openai");
  const { embedMany } = await import("ai");

  /**
   * The OpenAI key is Sensitive in Vercel (unrecoverable), so it usually isn't
   * available locally. When it isn't, embed through the deployed, auth-gated
   * /api/admin/embed instead of distributing the secret. Set EMBED_PROXY to the
   * deployment origin and CRON_SECRET to authenticate.
   */
  const localKey = process.env.OPENAI_API_KEY;
  const proxyBase = process.env.EMBED_PROXY;
  const proxySecret = process.env.CRON_SECRET;
  const useProxy = !localKey && !!proxyBase && !!proxySecret;
  if (!localKey && !useProxy) {
    console.error(
      "No OPENAI_API_KEY locally and no EMBED_PROXY/CRON_SECRET set.\n" +
        "Either add the key to .env.local, or run:\n" +
        "  EMBED_PROXY=https://<deployment> CRON_SECRET=<secret> npx tsx scripts/eval/run.ts",
    );
    process.exit(1);
  }
  console.log(useProxy ? `embedding via proxy: ${proxyBase}` : "embedding with local key");

  async function embedChunk(values: string[]): Promise<number[][]> {
    if (!useProxy) {
      const { embeddings } = await embedMany({
        model,
        values,
        ...(providerOptions ? { providerOptions } : {}),
      });
      return embeddings;
    }
    const res = await fetch(`${proxyBase}/api/admin/embed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${proxySecret}`,
        // Preview deployments sit behind Vercel SSO; the automation bypass lets
        // offline tooling reach them without a browser session.
        ...(process.env.VERCEL_BYPASS
          ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS }
          : {}),
      },
      body: JSON.stringify({ texts: values }),
    });
    if (!res.ok) throw new Error(`embed proxy ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { embeddings: (number[] | null)[] };
    return json.embeddings.map((e) => e ?? []);
  }
  const {
    buildLinkDocument,
    buildProfileDocument,
    cosineSimilarity,
  } = await import("../../src/lib/embeddings");
  const {
    computeCurationQualityScore,
    computeKeywordFit,
    computeInterestBoost,
    semanticRelevance,
    scoreCuratedLink,
  } = await import("../../src/lib/scoring");

  const events = loadAll<SynthEvent>("events_");
  const users = loadAll<SynthUser>("users_");
  const gold = loadAll<Gold>("gold_");
  console.log(`dataset: ${events.length} events, ${users.length} users, ${gold.length} gold labels (dims=${dims})\n`);
  if (!events.length || !users.length || !gold.length) {
    console.error("Missing dataset files — has the generation workflow finished?");
    process.exit(1);
  }

  // ---- embed (content-addressed cache: re-runs cost nothing) ----
  const cache = new EmbedCache(`${DIR}/emb-cache-${dims}.json`);
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = openai.textEmbedding(MODEL);
  // text-embedding-3-* support Matryoshka truncation via `dimensions`; passed
  // through providerOptions in AI SDK v7 rather than as a model setting.
  const providerOptions =
    dims === 1536 ? undefined : { openai: { dimensions: dims } };

  const docs = new Map<string, string>();
  for (const e of events) docs.set(e.id, buildLinkDocument(linkShape(e)));
  for (const u of users) docs.set(u.id, buildProfileDocument(profileShape(u)));

  const vecs = new Map<string, number[]>();
  const misses: { id: string; text: string }[] = [];
  for (const [id, text] of docs) {
    const hit = cache.get(contentKey(MODEL, dims, text));
    if (hit) vecs.set(id, hit);
    else misses.push({ id, text });
  }
  console.log(`embeddings: ${vecs.size} cached, ${misses.length} to fetch`);
  for (let i = 0; i < misses.length; i += 96) {
    const chunk = misses.slice(i, i + 96);
    const embeddings = await embedChunk(chunk.map((c) => c.text));
    chunk.forEach((c, k) => {
      const v = embeddings[k];
      if (!v?.length) return;
      vecs.set(c.id, v);
      cache.set(contentKey(MODEL, dims, c.text), v);
    });
    cache.save(); // checkpoint so a mid-run failure doesn't lose paid work
    console.log(`  embedded ${Math.min(i + 96, misses.length)}/${misses.length}`);
  }

  // ---- cosine distribution (drives calibration) ----
  const allCos: number[] = [];
  const cosByPair = new Map<string, number>();
  for (const u of users) {
    const uv = vecs.get(u.id)!;
    for (const e of events) {
      const c = cosineSimilarity(uv, vecs.get(e.id)!);
      cosByPair.set(`${u.id}|${e.id}`, c);
      allCos.push(c);
    }
  }
  const sorted = [...allCos].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.floor((sorted.length - 1) * p)];
  console.log(
    `cosine distribution: min=${sorted[0].toFixed(3)} p05=${pct(0.05).toFixed(3)} p50=${pct(0.5).toFixed(3)} p95=${pct(0.95).toFixed(3)} p99=${pct(0.99).toFixed(3)} max=${sorted[sorted.length - 1].toFixed(3)}\n`,
  );

  const cqs = new Map(events.map((e) => [e.id, computeCurationQualityScore(linkShape(e))]));
  const kw = new Map<string, number>();
  for (const u of users) {
    for (const e of events) {
      kw.set(`${u.id}|${e.id}`, computeKeywordFit(profileShape(u), linkShape(e)));
    }
  }

  // ---- scoring variants ----
  type Scorer = (u: SynthUser, e: SynthEvent) => number;
  const rand = (() => {
    let s = 42;
    return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  })();

  const relCurrent = (u: SynthUser, e: SynthEvent) =>
    semanticRelevance(cosByPair.get(`${u.id}|${e.id}`)!);
  /** Percentile-calibrated: map the observed cosine band onto 0-100 instead of
   * the hand-guessed 0.15-0.55 constants. */
  const lo = pct(0.05);
  const hi = pct(0.995);
  const relCalib = (u: SynthUser, e: SynthEvent) => {
    const c = cosByPair.get(`${u.id}|${e.id}`)!;
    return Math.round(Math.min(1, Math.max(0, (c - lo) / (hi - lo))) * 100);
  };
  const boost = (u: SynthUser, e: SynthEvent) =>
    computeInterestBoost(profileShape(u), e.tags ?? []);

  const variants: Record<string, Scorer> = {
    // The real end-to-end production function, exercised exactly as the app
    // calls it — the single number that says whether shipping this helped.
    "SHIPPED scoreCuratedLink()": (u, e) =>
      scoreCuratedLink(profileShape(u) as never, linkShape(e), {
        profileEmbedding: vecs.get(u.id),
        linkEmbedding: vecs.get(e.id),
      }).sortKey,
    "random (floor)": () => rand(),
    "cqs only (no personalization)": (_u, e) => cqs.get(e.id)!,
    "keyword only": (u, e) => kw.get(`${u.id}|${e.id}`)!,
    "keyword blend (old fallback)": (u, e) =>
      0.6 * kw.get(`${u.id}|${e.id}`)! + 0.4 * cqs.get(e.id)! + boost(u, e),
    "semantic raw cosine": (u, e) => cosByPair.get(`${u.id}|${e.id}`)!,
    "PROD: 0.6 sem + 0.4 cqs": (u, e) => 0.6 * relCurrent(u, e) + 0.4 * cqs.get(e.id)! + boost(u, e),
    "calibrated 0.6 sem + 0.4 cqs": (u, e) => 0.6 * relCalib(u, e) + 0.4 * cqs.get(e.id)! + boost(u, e),
  };

  if (sweep) {
    for (const w of [0.7, 0.8, 0.85, 0.9, 1.0]) {
      variants[`calibrated ${w} sem + ${(1 - w).toFixed(2)} cqs`] = (u, e) =>
        w * relCalib(u, e) + (1 - w) * cqs.get(e.id)! + boost(u, e);
    }
    // Quality as a FLOOR rather than a blended term: rank on relevance, but
    // push genuinely low-quality listings down. Tests whether the FP@10 cost of
    // a high relevance weight can be bought back without losing precision.
    for (const floor of [35, 45]) {
      variants[`sem 0.9 + cqs floor<${floor}`] = (u, e) => {
        const base = 0.9 * relCalib(u, e) + 0.1 * cqs.get(e.id)! + boost(u, e);
        return cqs.get(e.id)! < floor ? base - 40 : base;
      };
    }
    // Reciprocal-rank fusion: combines two rankings without needing their
    // scores to share a scale — immune to the calibration problem entirely.
    const rankMap = (key: (e: SynthEvent) => number) => {
      const order = [...events].sort((a, b) => key(b) - key(a));
      return new Map(order.map((e, i) => [e.id, i + 1]));
    };
    const cqsRank = rankMap((e) => cqs.get(e.id)!);
    const semRankByUser = new Map(
      users.map((u) => [u.id, rankMap((e) => cosByPair.get(`${u.id}|${e.id}`)!)]),
    );
    variants["RRF(semantic, cqs) k=60"] = (u, e) => {
      const rs = semRankByUser.get(u.id)!.get(e.id)!;
      const rq = cqsRank.get(e.id)!;
      return 1 / (60 + rs) + 1 / (60 + rq);
    };
  }

  // ---- evaluate ----
  const goldByUser = new Map(gold.map((g) => [g.userId, g]));
  const results: { name: string; m: Metrics; per: Metrics[] }[] = [];

  for (const [name, score] of Object.entries(variants)) {
    const per: Metrics[] = [];
    for (const u of users) {
      const g = goldByUser.get(u.id);
      if (!g?.top10?.length) continue;
      const ranked = [...events]
        .map((e) => ({ id: e.id, s: score(u, e) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id);
      per.push(evaluate(ranked, g.top10, g.irrelevant ?? []));
    }
    results.push({ name, m: meanMetrics(per), per });
  }

  console.log(METRICS_HEADER);
  console.log("-".repeat(METRICS_HEADER.length));
  for (const r of results) console.log(formatRow(r.name, r.m));

  const evaluated = results[0]?.per.length ?? 0;
  console.log(`\nusers evaluated: ${evaluated}/${users.length}`);
  console.log(`cache: ${JSON.stringify(cache.stats())}`);

  writeFileSync(
    `${DIR}/results-${dims}.json`,
    JSON.stringify(
      {
        dims,
        events: events.length,
        users: users.length,
        evaluated,
        cosine: { p05: pct(0.05), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
        variants: results.map((r) => ({ name: r.name, ...r.m })),
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${DIR}/results-${dims}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
