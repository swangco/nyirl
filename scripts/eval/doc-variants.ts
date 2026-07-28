import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, readdirSync } from "fs";
import { EmbedCache, contentKey } from "./cache";
import {
  METRICS_HEADER,
  evaluate,
  formatPaired,
  formatRow,
  meanMetrics,
  paired,
  type Metrics,
} from "./metrics";

/**
 * Measures how the PROFILE DOCUMENT is built, holding the scoring blend fixed.
 *
 * run.ts answers "how should we combine relevance and quality". This answers a
 * different and largely independent question: "what text should we embed for a
 * person in the first place". Both problems 1 (sparse profiles / intent) and 2
 * (resume swamping) are document-construction problems, not scoring problems,
 * so they are measured here.
 *
 * Run: EMBED_PROXY=... CRON_SECRET=... VERCEL_BYPASS=... npx tsx scripts/eval/doc-variants.ts
 */

const DIR = ".context/recsys-eval";
const MODEL = "text-embedding-3-small";

type SynthUser = {
  id: string;
  fullName: string;
  title: string;
  company: string;
  profileType: string[];
  bioBlurb: string;
  interests: string[];
};
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
type Gold = { userId: string; top10: string[]; irrelevant: string[] };

function loadAll<T>(prefix: string): T[] {
  const out: T[] = [];
  for (const f of readdirSync(DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".json"))) {
    const p = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
    if (Array.isArray(p)) out.push(...p);
  }
  return out;
}

/**
 * What each profile type is actually LOOKING FOR. The asymmetry this fixes: the
 * profile document describes a PERSON while the event document describes an
 * EVENT, so cosine is asked to bridge two registers. Stating intent moves the
 * profile toward the register of the thing we're matching against — and it is
 * the only signal that distinguishes "backend engineer" from "backend engineer
 * who needs a job", who want very different rooms.
 */
const INTENT: Record<string, string> = {
  founder: "other founders, investors, early customers, operators who have scaled",
  investor: "founders raising, deal flow, other investors, emerging managers",
  engineer: "deep technical talks, practitioners, hands-on workshops with peers",
  operator: "operators at similar stage, tactical playbooks, peer benchmarking",
  marketing_gtm: "growth and marketing practitioners, channel tactics, brand work",
  job_seeking: "teams that are hiring, hiring managers, founders building teams, referrals",
  other: "the NYC tech community",
};

function intentLine(profileType: string[]): string {
  const wants = [...new Set((profileType ?? []).map((t) => INTENT[t]).filter(Boolean))];
  return wants.length ? `Looking for: ${wants.join("; ")}` : "";
}

/** Canned description so a name-plus-one-checkbox profile lands somewhere
 * sensible instead of at a near-random point in the space. */
const TYPE_PRIOR: Record<string, string> = {
  founder: "A startup founder building a company in New York.",
  investor: "An investor who backs early-stage startups.",
  engineer: "A software engineer who builds and operates technical systems.",
  operator: "An operator running go-to-market or business operations at a startup.",
  marketing_gtm: "A marketing and go-to-market professional at a technology company.",
  job_seeking: "A technology professional looking for their next role.",
  other: "A member of the New York technology community.",
};

function buildDoc(
  u: SynthUser,
  opts: { intent: boolean; prior: boolean; resume: string | null; resumeCap: number },
): string {
  const parts: string[] = [];
  if (u.title || u.company) parts.push([u.title, u.company].filter(Boolean).join(" at "));
  if (u.profileType?.length) parts.push(`Role: ${u.profileType.join(", ")}`);
  if (u.bioBlurb?.trim()) parts.push(u.bioBlurb.trim());
  if (u.interests?.length) parts.push(`Interests: ${u.interests.join(", ")}`);
  if (opts.intent) {
    const line = intentLine(u.profileType);
    if (line) parts.push(line);
  }
  if (opts.resume?.trim()) parts.push(`Resume: ${opts.resume.trim().slice(0, opts.resumeCap)}`);
  let doc = parts.join("\n");
  if (opts.prior && doc.length < 150) {
    const prior = (u.profileType ?? []).map((t) => TYPE_PRIOR[t]).filter(Boolean).join(" ");
    if (prior) doc = `${doc}\n${prior}`;
  }
  return doc;
}

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

async function main() {
  const { buildLinkDocument, cosineSimilarity } = await import("../../src/lib/embeddings");
  const { computeCurationQualityScore, computeInterestBoost, semanticRelevancePrecise } =
    await import("../../src/lib/scoring");

  const users = loadAll<SynthUser>("users_");
  const events = loadAll<SynthEvent>("events_");
  const gold = loadAll<Gold>("gold_");
  const resumes: Record<string, string> = existsSync(`${DIR}/resumes.json`)
    ? JSON.parse(readFileSync(`${DIR}/resumes.json`, "utf8"))
    : {};
  console.log(
    `users=${users.length} events=${events.length} gold=${gold.length} resumes=${Object.keys(resumes).length}\n`,
  );

  const cache = new EmbedCache(`${DIR}/emb-cache-1536.json`);
  const proxy = process.env.EMBED_PROXY;
  const secret = process.env.CRON_SECRET;

  async function embedAll(texts: string[]): Promise<(number[] | null)[]> {
    const out: (number[] | null)[] = texts.map(() => null);
    const miss: { i: number; t: string }[] = [];
    texts.forEach((t, i) => {
      const hit = cache.get(contentKey(MODEL, 1536, t));
      if (hit) out[i] = hit;
      else miss.push({ i, t });
    });
    for (let s = 0; s < miss.length; s += 96) {
      const chunk = miss.slice(s, s + 96);
      const res = await fetch(`${proxy}/api/admin/embed`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
          ...(process.env.VERCEL_BYPASS
            ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS }
            : {}),
        },
        body: JSON.stringify({ texts: chunk.map((c) => c.t) }),
      });
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      const j = (await res.json()) as { embeddings: (number[] | null)[] };
      chunk.forEach((c, k) => {
        const v = j.embeddings[k];
        if (v?.length) {
          out[c.i] = v;
          cache.set(contentKey(MODEL, 1536, c.t), v);
        }
      });
      cache.save();
    }
    return out;
  }

  // Item vectors are identical across variants — embed once.
  const eventVecs = await embedAll(events.map((e) => buildLinkDocument(linkShape(e))));
  const cqs = events.map((e) => computeCurationQualityScore(linkShape(e)));
  const goldBy = new Map(gold.map((g) => [g.userId, g]));

  const VARIANTS: { name: string; o: Parameters<typeof buildDoc>[1] }[] = [
    { name: "A. current (no resume)", o: { intent: false, prior: false, resume: null, resumeCap: 6000 } },
    { name: "B. + intent line", o: { intent: true, prior: false, resume: null, resumeCap: 6000 } },
    { name: "C. + intent + type prior", o: { intent: true, prior: true, resume: null, resumeCap: 6000 } },
    { name: "D. PROD-like: resume 6000", o: { intent: false, prior: false, resume: "USE", resumeCap: 6000 } },
    { name: "E. resume 6000 + intent", o: { intent: true, prior: false, resume: "USE", resumeCap: 6000 } },
    { name: "F. resume 800", o: { intent: false, prior: false, resume: "USE", resumeCap: 800 } },
    { name: "G. resume 800 + intent", o: { intent: true, prior: false, resume: "USE", resumeCap: 800 } },
    { name: "H. resume 300 + intent", o: { intent: true, prior: false, resume: "USE", resumeCap: 300 } },
  ];

  const rows: { name: string; m: Metrics; per: Metrics[] }[] = [];
  for (const v of VARIANTS) {
    const docs = users.map((u) =>
      buildDoc(u, { ...v.o, resume: v.o.resume === "USE" ? (resumes[u.id] ?? null) : null }),
    );
    const uv = await embedAll(docs);
    const per: Metrics[] = [];
    users.forEach((u, ui) => {
      const g = goldBy.get(u.id);
      const pv = uv[ui];
      if (!g?.top10?.length || !pv) return;
      const ranked = events
        .map((e, ei) => {
          const rel = semanticRelevancePrecise(cosineSimilarity(pv, eventVecs[ei]!));
          const boost = computeInterestBoost({ interests: u.interests as never }, e.tags ?? []);
          return { id: e.id, s: 0.8 * rel + 0.2 * cqs[ei] + boost };
        })
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id);
      per.push(evaluate(ranked, g.top10, g.irrelevant ?? []));
    });
    rows.push({ name: v.name, m: meanMetrics(per), per });
    const avgLen = Math.round(docs.reduce((s, d) => s + d.length, 0) / docs.length);
    console.log(`${v.name.padEnd(28)} avg doc ${String(avgLen).padStart(5)} chars`);
  }

  console.log(`\n${METRICS_HEADER}`);
  console.log("-".repeat(METRICS_HEADER.length));
  for (const r of rows) console.log(formatRow(r.name, r.m));

  // Paired tests answer the questions the averages cannot. Bar: |t| > 2.
  console.log("\nPAIRED (P@5), same 50 users:");
  const by = (n: string) => rows.find((r) => r.name.startsWith(n))!.per;
  const cmp: [string, string, string][] = [
    ["A", "B", "intent line (no resume)"],
    ["A", "C", "intent + type prior"],
    ["A", "D", "adding a 6000-char resume"],
    ["D", "F", "resume 6000 -> 800"],
    ["D", "G", "resume 6000 -> 800 + intent"],
    ["F", "H", "resume 800 -> 300"],
  ];
  for (const [a, b, label] of cmp) {
    console.log(formatPaired(`  ${label}`, paired(by(a), by(b), "p5")));
  }

  // P@5 is coarse (5 slots). NDCG uses the full ranked order and FP@10 is the
  // trust-critical metric, so the resume question is decided on those.
  console.log("\nPAIRED (NDCG@10):");
  for (const [a, b, label] of cmp) {
    console.log(formatPaired(`  ${label}`, paired(by(a), by(b), "ndcg10")));
  }
  console.log("\nPAIRED (FP@10, negative delta = FEWER bad picks = better):");
  for (const [a, b, label] of cmp) {
    console.log(formatPaired(`  ${label}`, paired(by(a), by(b), "fp10")));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
