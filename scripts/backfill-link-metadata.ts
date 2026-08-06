import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Repairs curated_links rows against the live listing pages.
 *
 * Two defects made every existing row worse than the source data:
 *  - extractMeta lacked the `s` regex flag, so any og:description containing a
 *    newline failed to match at all and the row stored NULL.
 *  - even when it matched, og:description is Luma's ~150-char SEO summary. The
 *    listing publishes its full text as schema.org JSON-LD; measured across the
 *    live corpus that is a median of ~1,460 more characters per row.
 * It also fills host_names, which never existed.
 *
 * Only ever WIDENS: a row is updated when the fetch returns strictly more
 * description than is stored, so a transient bad fetch cannot erase good data.
 * Embeddings are NOT recomputed here — run the embeddings backfill afterwards,
 * which is content-addressed and will notice the documents changed.
 *
 * Run: npx tsx scripts/backfill-link-metadata.ts [--apply]
 */
(async () => {
  const apply = process.argv.includes("--apply");
  const { db } = await import("../src/db");
  const { curatedLinks } = await import("../src/db/schema");
  const { fetchLinkPreview } = await import("../src/lib/og-meta");
  const { eq } = await import("drizzle-orm");

  const rows = await db.query.curatedLinks.findMany();
  console.log(`${rows.length} links${apply ? "" : "  (DRY RUN — pass --apply to write)"}\n`);

  let descUpdated = 0, hostUpdated = 0, skipped = 0, failed = 0, gained = 0;
  let dateFilled = 0, imageFilled = 0;
  for (const row of rows) {
    let preview;
    try {
      preview = await fetchLinkPreview(row.sourceUrl);
    } catch {
      failed++;
      continue;
    }
    const oldDesc = row.description ?? "";
    const newDesc = preview.description ?? "";
    const takeDesc = newDesc.length > oldDesc.length;
    const takeHost = preview.hostNames.length > 0 && !(row.hostNames ?? []).length;
    // Fill-only, never overwrite: a transient scrape must not be able to move a
    // date the host already set.
    const takeDate = !row.eventDate && !!preview.eventDate;
    const takeImage = !row.imageUrl && !!preview.imageUrl;
    if (!takeDesc && !takeHost && !takeDate && !takeImage) { skipped++; continue; }

    const patch: Record<string, unknown> = {};
    if (takeDesc) { patch.description = newDesc; descUpdated++; gained += newDesc.length - oldDesc.length; }
    if (takeHost) { patch.hostNames = preview.hostNames; hostUpdated++; }
    if (takeDate) { patch.eventDate = preview.eventDate; dateFilled++; }
    if (takeImage) { patch.imageUrl = preview.imageUrl; imageFilled++; }
    if (apply) await db.update(curatedLinks).set(patch).where(eq(curatedLinks.id, row.id));

    console.log(
      `  ${takeDesc ? `desc ${String(oldDesc.length).padStart(4)}->${String(newDesc.length).padStart(4)}` : "desc    —    "}` +
      `  ${takeHost ? `host=${JSON.stringify(preview.hostNames).slice(0, 34)}` : "host —"}` +
      `  ${(row.title ?? row.sourceUrl).slice(0, 40)}`,
    );
  }

  console.log(`\n  descriptions widened : ${descUpdated}`);
  console.log(`  hosts filled         : ${hostUpdated}`);
  console.log(`  dates filled         : ${dateFilled}`);
  console.log(`  images filled        : ${imageFilled}`);
  console.log(`  already current      : ${skipped}`);
  console.log(`  fetch failures       : ${failed}`);
  console.log(`  characters gained    : ${gained}`);
  console.log(apply ? "\n  WRITTEN." : "\n  DRY RUN — nothing written.");
  process.exit(0);
})();
