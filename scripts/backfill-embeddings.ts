import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Backfills semantic embeddings for every profile, curated link, and hosted
 * event that doesn't have one yet. Idempotent — re-running only touches rows
 * still missing an embedding. Requires OPENAI_API_KEY (see lib/embeddings.ts);
 * without it there is nothing to do.
 *
 * Run:  node scripts/backfill-embeddings.ts    (Node 23+ strips the types)
 *   or: npx tsx scripts/backfill-embeddings.ts
 */
async function main() {
  const { db } = await import("../src/db");
  const { profiles, curatedLinks, events } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const {
    embeddingsEnabled,
    embedTexts,
    buildProfileDocument,
    buildLinkDocument,
    buildEventDocument,
  } = await import("../src/lib/embeddings");

  if (!embeddingsEnabled()) {
    console.error(
      "OPENAI_API_KEY is not set — embeddings are disabled, nothing to backfill.\n" +
        "Add it to .env.local (and to Vercel env for production) and re-run.",
    );
    process.exit(1);
  }

  const profileRows = await db.query.profiles.findMany();
  const pMissing = profileRows.filter((p) => !p.embedding);
  if (pMissing.length) {
    const embs = await embedTexts(pMissing.map((p) => buildProfileDocument(p)));
    let n = 0;
    for (let i = 0; i < pMissing.length; i++) {
      const e = embs[i];
      if (!e) continue;
      await db.update(profiles).set({ embedding: e }).where(eq(profiles.id, pMissing[i].id));
      n++;
    }
    console.log(`profiles: embedded ${n}/${pMissing.length}`);
  } else {
    console.log("profiles: none missing");
  }

  const linkRows = await db.query.curatedLinks.findMany();
  const lMissing = linkRows.filter((l) => !l.embedding);
  if (lMissing.length) {
    const embs = await embedTexts(lMissing.map((l) => buildLinkDocument(l)));
    let n = 0;
    for (let i = 0; i < lMissing.length; i++) {
      const e = embs[i];
      if (!e) continue;
      await db.update(curatedLinks).set({ embedding: e }).where(eq(curatedLinks.id, lMissing[i].id));
      n++;
    }
    console.log(`curated_links: embedded ${n}/${lMissing.length}`);
  } else {
    console.log("curated_links: none missing");
  }

  const eventRows = await db.query.events.findMany();
  const eMissing = eventRows.filter((e) => !e.embedding);
  if (eMissing.length) {
    const embs = await embedTexts(eMissing.map((e) => buildEventDocument(e)));
    let n = 0;
    for (let i = 0; i < eMissing.length; i++) {
      const e = embs[i];
      if (!e) continue;
      await db.update(events).set({ embedding: e }).where(eq(events.id, eMissing[i].id));
      n++;
    }
    console.log(`events: embedded ${n}/${eMissing.length}`);
  } else {
    console.log("events: none missing");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
