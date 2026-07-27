import { config } from "dotenv";
config({ path: "/Users/stalapaneni/conductor/workspaces/nyirl/manama-v1/.env.local" });
import { neon } from "@neondatabase/serverless";
import { cosineSimilarity } from "./src/lib/embeddings";
import { computeCurationQualityScore, semanticRelevance, scoreCuratedLink } from "./src/lib/scoring";
const sql = neon(process.env.DATABASE_URL!);
const parse = (v: any): number[] => typeof v === "string" ? JSON.parse(v) : v;

async function main() {
  const profs: any[] = await sql.query(`select id,user_id,full_name,profile_type,bio_blurb,interests,gender_identity,embedding from profiles`);
  const links: any[] = await sql.query(`select id,title,description,category,format,exclusivity,out_of_town,tags,event_date,embedding from curated_links`);
  console.log(`profiles=${profs.length} links=${links.length}`);

  const all: {p:string;l:string;cos:number}[] = [];
  for (const p of profs) {
    const pv = parse(p.embedding);
    for (const l of links) {
      all.push({p:p.full_name,l:(l.title??"").slice(0,60),cos:cosineSimilarity(pv, parse(l.embedding))});
    }
  }
  const s = all.map(a=>a.cos).sort((a,b)=>a-b);
  const pct=(x:number)=>s[Math.floor((s.length-1)*x)];
  console.log(`\nREAL cosine(profile,link) over ${s.length} pairs:`);
  console.log(`min=${s[0].toFixed(3)} p01=${pct(.01).toFixed(3)} p05=${pct(.05).toFixed(3)} p25=${pct(.25).toFixed(3)} p50=${pct(.5).toFixed(3)} p75=${pct(.75).toFixed(3)} p95=${pct(.95).toFixed(3)} p99=${pct(.99).toFixed(3)} max=${s[s.length-1].toFixed(3)}`);
  console.log(`=> semanticRelevance maps these to: min=${semanticRelevance(s[0])} p05=${semanticRelevance(pct(.05))} p50=${semanticRelevance(pct(.5))} p95=${semanticRelevance(pct(.95))} max=${semanticRelevance(s[s.length-1])}`);
  const spread = semanticRelevance(pct(.95))-semanticRelevance(pct(.05));
  console.log(`=> relevance spread p05..p95 = ${spread} points (of 100)`);

  const cq = links.map(l=>computeCurationQualityScore(l as any)).sort((a,b)=>a-b);
  console.log(`\nCQS over 41 links: min=${cq[0]} p25=${cq[Math.floor(cq.length*.25)]} median=${cq[Math.floor(cq.length/2)]} p75=${cq[Math.floor(cq.length*.75)]} max=${cq[cq.length-1]} distinct=${new Set(cq).size}`);
  console.log(`=> 0.4*CQS spread = ${(0.4*(cq[cq.length-1]-cq[0])).toFixed(1)} pts vs 0.6*relevance spread = ${(0.6*spread).toFixed(1)} pts`);

  // per-profile top-8 under current production scoring, over ALL links (not just upcoming)
  for (const p of profs) {
    const pv = parse(p.embedding);
    const ranked = links.map(l=>{
      const sc = scoreCuratedLink(p as any, l as any, {profileEmbedding:pv, linkEmbedding:parse(l.embedding)});
      return {t:(l.title??"").slice(0,58), cat:l.category, sc:sc.score, rel:sc.relevance, q:sc.quality, b:sc.boosts};
    }).sort((a,b)=>b.sc-a.sc);
    console.log(`\n--- ${p.full_name} [${(p.profile_type??[]).join("/")}] interests=${(p.interests??[]).join(",")||"none"} ---`);
    for (const r of ranked.slice(0,8)) console.log(`  ${String(r.sc).padStart(3)} (rel ${String(r.rel).padStart(3)} q ${String(r.q).padStart(3)} b ${r.b})  [${r.cat}] ${r.t}`);
    const cats = ranked.slice(0,10).map(r=>r.cat);
    console.log(`  top10 categories: ${JSON.stringify(cats.reduce((m:any,c)=>{m[c]=(m[c]||0)+1;return m;},{}))}`);
    console.log(`  score range top1..top10: ${ranked[0].sc} .. ${ranked[9].sc}`);
  }

  // how much does relevance actually reorder vs pure CQS?
  const byCqs = links.map(l=>({id:l.id, q:computeCurationQualityScore(l as any)})).sort((a,b)=>b.q-a.q).map(x=>x.id);
  for (const p of profs) {
    const pv = parse(p.embedding);
    const r = links.map(l=>({id:l.id, s:scoreCuratedLink(p as any,l as any,{profileEmbedding:pv,linkEmbedding:parse(l.embedding)}).score})).sort((a,b)=>b.s-a.s).map(x=>x.id);
    const overlap = r.slice(0,10).filter(id=>byCqs.slice(0,10).includes(id)).length;
    console.log(`${p.full_name}: top-10 overlap with non-personalized CQS-only ranking = ${overlap}/10`);
  }
}
main();
