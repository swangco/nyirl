import { eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, events, profiles } from "@/db/schema";
import {
  buildEventDocument,
  buildLinkDocument,
  buildProfileDocument,
  embedText,
  embedTexts,
  embeddingsEnabled,
  EMBEDDING_DIM,
} from "@/lib/embeddings";

/**
 * Operational endpoint for the embedding layer, so it can be inspected and
 * populated on Vercel — where the OpenAI key actually lives. The key is stored
 * "Sensitive" (write-only, unrecoverable, un-renameable), so it can't be pulled
 * locally to run scripts/backfill-embeddings.ts.
 *
 *   GET  — status: is a key visible, does a live call succeed, how many rows
 *          still need vectors. Never returns the key or any vector.
 *   POST — backfill every row missing an embedding. Idempotent.
 *
 * Auth: the single host's session, or a `Bearer <CRON_SECRET>` header so it can
 * be driven from a terminal without a browser sign-in.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

async function authorize(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  const session = await auth();
  return session?.user?.id === HOST_USER_ID;
}

async function counts() {
  const [p, l, e] = await Promise.all([
    db.query.profiles.findMany({ columns: { id: true }, where: isNull(profiles.embedding) }),
    db.query.curatedLinks.findMany({ columns: { id: true }, where: isNull(curatedLinks.embedding) }),
    db.query.events.findMany({ columns: { id: true }, where: isNull(events.embedding) }),
  ]);
  return { profiles: p.length, curatedLinks: l.length, events: e.length };
}

export async function GET(req: Request) {
  if (!(await authorize(req))) return new Response("Not authorized", { status: 401 });

  const keyVisible = embeddingsEnabled();
  const missing = await counts();

  // Prove the key actually works with one real call — the only way to
  // distinguish "key present" from "key valid".
  let liveCall: { ok: boolean; dimensions?: number; note: string } = {
    ok: false,
    note: "skipped — no key visible to the process",
  };
  if (keyVisible) {
    const v = await embedText("NY IRL embedding connectivity check");
    liveCall = v
      ? {
          ok: true,
          dimensions: v.length,
          note:
            v.length === EMBEDDING_DIM
              ? "OpenAI accepted the key and returned a usable vector"
              : `unexpected dimension (expected ${EMBEDDING_DIM})`,
        }
      : { ok: false, note: "key was visible but the OpenAI call failed — see function logs" };
  }

  return Response.json({
    keyVisible,
    liveCall,
    rowsMissingEmbeddings: missing,
    ready: keyVisible && liveCall.ok,
    hint: "POST to this URL with the same auth to backfill missing embeddings.",
  });
}

export async function POST(req: Request) {
  if (!(await authorize(req))) return new Response("Not authorized", { status: 401 });
  if (!embeddingsEnabled()) {
    return Response.json({ error: "No OpenAI key visible to this deployment." }, { status: 400 });
  }

  // `?force=1` re-embeds rows that already have a vector. Needed whenever the
  // DOCUMENT construction changes (e.g. resume text was removed from the
  // profile document): existing vectors were built from the old text and are
  // silently stale, and the default NULL-only backfill can never reach them.
  const force = new URL(req.url).searchParams.get("force") === "1";

  const [profileRows, linkRows, eventRows] = await Promise.all([
    db.query.profiles.findMany(force ? undefined : { where: isNull(profiles.embedding) }),
    db.query.curatedLinks.findMany(
      force ? undefined : { where: isNull(curatedLinks.embedding) },
    ),
    db.query.events.findMany(force ? undefined : { where: isNull(events.embedding) }),
  ]);

  const [profileVecs, linkVecs, eventVecs] = await Promise.all([
    embedTexts(profileRows.map(buildProfileDocument)),
    embedTexts(linkRows.map(buildLinkDocument)),
    embedTexts(eventRows.map(buildEventDocument)),
  ]);

  let embeddedProfiles = 0;
  for (let i = 0; i < profileRows.length; i++) {
    const v = profileVecs[i];
    if (!v) continue;
    // Record the document alongside the vector, so saveProfile's
    // skip-if-unchanged check has an accurate reference point afterwards.
    await db
      .update(profiles)
      .set({ embedding: v, embeddingDocument: buildProfileDocument(profileRows[i]) })
      .where(eq(profiles.id, profileRows[i].id));
    embeddedProfiles++;
  }

  let embeddedLinks = 0;
  for (let i = 0; i < linkRows.length; i++) {
    const v = linkVecs[i];
    if (!v) continue;
    await db.update(curatedLinks).set({ embedding: v }).where(eq(curatedLinks.id, linkRows[i].id));
    embeddedLinks++;
  }

  let embeddedEvents = 0;
  for (let i = 0; i < eventRows.length; i++) {
    const v = eventVecs[i];
    if (!v) continue;
    await db.update(events).set({ embedding: v }).where(eq(events.id, eventRows[i].id));
    embeddedEvents++;
  }

  return Response.json({
    profiles: { attempted: profileRows.length, embedded: embeddedProfiles },
    curatedLinks: { attempted: linkRows.length, embedded: embeddedLinks },
    events: { attempted: eventRows.length, embedded: embeddedEvents },
    remaining: await counts(),
  });
}
