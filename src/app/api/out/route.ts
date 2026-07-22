import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, digestItemKindEnum, events, interactionSourceEnum } from "@/db/schema";
import { logInteraction } from "@/lib/interactions";

// Outbound click tracker: logs the click, then redirects to the target. The
// target is derived server-side from the referenced item (never a client-
// supplied URL), so this endpoint can't be turned into an open redirect and
// can only log clicks on items that actually exist. Not cached (reads params +
// session, writes) — explicit since it must always run.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("id");
  const kindRaw = searchParams.get("kind") ?? "";
  const sourceRaw = searchParams.get("source") ?? "";
  const uid = searchParams.get("uid");

  const home = new URL("/", request.url);
  if (!itemId) return NextResponse.redirect(home);

  const itemKind = (digestItemKindEnum as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof digestItemKindEnum)[number])
    : "link";
  const source = (interactionSourceEnum as readonly string[]).includes(sourceRaw)
    ? (sourceRaw as (typeof interactionSourceEnum)[number])
    : "homepage";
  const isDigest = source === "digest";

  // Resolve the redirect target from the item itself. A link goes to its stored
  // sourceUrl (validated as http(s) at insert time); an event goes to its
  // on-site apply page. An unknown/forged id resolves to nothing → home.
  let target: string | null = null;
  if (itemKind === "link") {
    const link = await db.query.curatedLinks.findFirst({
      where: eq(curatedLinks.id, itemId),
      columns: { sourceUrl: true },
    });
    target = link?.sourceUrl ?? null;
  } else {
    const event = await db.query.events.findFirst({
      where: eq(events.id, itemId),
      columns: { id: true },
    });
    target = event ? new URL(`/events/${event.id}/apply`, request.url).toString() : null;
  }

  if (!target) return NextResponse.redirect(home);

  // Defense in depth — stored sourceUrls are validated on insert, but never
  // redirect to a non-http(s) scheme regardless.
  let dest: URL;
  try {
    dest = new URL(target);
  } catch {
    return NextResponse.redirect(home);
  }
  if (dest.protocol !== "http:" && dest.protocol !== "https:") {
    return NextResponse.redirect(home);
  }

  // Digest clicks arrive from email with no session cookie, so attribute via
  // the uid embedded in the per-recipient link; on-site clicks use the session.
  const userId = isDigest ? uid : ((await auth())?.user?.id ?? null);
  await logInteraction({
    userId,
    itemKind,
    itemId,
    action: isDigest ? "digest_click" : "click",
    source,
  });

  return NextResponse.redirect(dest);
}
