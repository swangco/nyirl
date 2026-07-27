import { config } from "dotenv";
config({ path: "/Users/stalapaneni/conductor/workspaces/nyirl/manama-v1/.env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
async function q(label: string, text: string) {
  try {
    const rows = await sql.query(text);
    console.log(`\n### ${label}`);
    console.log(JSON.stringify(rows, null, 1).slice(0, 4500));
  } catch (e: any) { console.log(`\n### ${label}\nERR: ${e.message}`); }
}
async function main() {
await q("counts", `select
  (select count(*) from profiles) profiles,
  (select count(*) from profiles where embedding is not null) profiles_emb,
  (select count(*) from curated_links) links,
  (select count(*) from curated_links where embedding is not null) links_emb,
  (select count(*) from curated_links where event_date >= now()) links_upcoming,
  (select count(*) from events) events,
  (select count(*) from registrations) regs,
  (select count(*) from connections) conns,
  (select count(*) from digest_sends) digests,
  (select count(*) from interaction_events) ievents`);
await q("link cat/format/excl", `select category, format, exclusivity, out_of_town, count(*) n from curated_links group by 1,2,3,4 order by n desc`);
await q("upcoming days out", `select (event_date::date - now()::date) as days_out, count(*) from curated_links where event_date >= now() group by 1 order by 1`);
await q("interactions", `select action, source, count(*) n, count(distinct user_id) users, count(distinct item_id) items from interaction_events group by 1,2 order by n desc`);
await q("impressions per item top", `select item_id, count(*) n from interaction_events where action='impression' group by 1 order by n desc limit 10`);
await q("profiles sparsity", `select left(full_name,12) nm, coalesce(array_length(profile_type,1),0) ntypes, length(coalesce(bio_blurb,'')) biolen, length(coalesce(resume_text_extracted,'')) resumelen, coalesce(array_length(interests,1),0) ninterests, embedding is not null hasemb from profiles`);
await q("link tags", `select unnest(coalesce(tags,'{}')) tag, count(*) from curated_links group by 1 order by 2 desc limit 30`);
await q("link titles", `select left(coalesce(title,source_url),80) title, category, format, exclusivity, event_date::date d from curated_links order by event_date nulls last limit 45`);
}
main();
