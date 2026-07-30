import { headers } from "next/headers";
import { db } from "@/db";
import {
  digestItemKindEnum,
  interactionActionEnum,
  interactionEvents,
  interactionSourceEnum,
} from "@/db/schema";

/**
 * Stage 0 interaction logging. Every write is best-effort — a logging failure
 * must never break a page render or a redirect, so all inserts are wrapped and
 * swallow their errors. This is the signal the recommendation system will
 * eventually learn from; today it just accumulates.
 */

type ItemKind = (typeof digestItemKindEnum)[number];
type Action = (typeof interactionActionEnum)[number];
type Source = (typeof interactionSourceEnum)[number];

export async function logInteraction(e: {
  userId?: string | null;
  itemKind: ItemKind;
  itemId: string;
  action: Action;
  source: Source;
  metadata?: unknown;
}): Promise<void> {
  try {
    await db.insert(interactionEvents).values({
      userId: e.userId ?? null,
      itemKind: e.itemKind,
      itemId: e.itemId,
      action: e.action,
      source: e.source,
      metadata: e.metadata != null ? JSON.stringify(e.metadata) : null,
    });
  } catch (err) {
    console.error("logInteraction failed:", err);
  }
}

/** True when the current request is a Next.js prefetch (Link hover/viewport) or
 * a similar non-interactive fetch, so a page can skip logging an impression the
 * user never actually saw. Best-effort — returns false if headers() is
 * unavailable. Keeps prefetch/bot noise out of the Stage 0 signal. */
export async function isPrefetchRequest(): Promise<boolean> {
  try {
    const h = await headers();
    return (
      h.get("next-router-prefetch") === "1" ||
      h.get("x-middleware-prefetch") === "1" ||
      h.get("purpose") === "prefetch" ||
      h.get("x-purpose") === "prefetch"
    );
  } catch {
    return false;
  }
}

/** Batch-logs impressions for a ranked list in one insert, recording each
 * item's rank position and score at render time. */
export async function logImpressions(
  items: { kind: ItemKind; id: string; score?: number | null }[],
  ctx: { userId?: string | null; source: Source },
): Promise<void> {
  if (items.length === 0) return;
  try {
    await db.insert(interactionEvents).values(
      items.map((it, i) => ({
        userId: ctx.userId ?? null,
        itemKind: it.kind,
        itemId: it.id,
        action: "impression" as const,
        source: ctx.source,
        metadata: JSON.stringify({ rank: i, score: it.score ?? null }),
      })),
    );
  } catch (err) {
    console.error("logImpressions failed:", err);
  }
}
