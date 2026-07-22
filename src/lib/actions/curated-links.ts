"use server";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum } from "@/db/schema";
import { fetchLinkPreview } from "@/lib/og-meta";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

async function requireHost() {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== HOST_USER_ID) {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function addCuratedLink(formData: FormData) {
  const userId = await requireHost();

  const url = String(formData.get("url") ?? "").trim();
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error("Enter a valid URL");
  }

  const categoryRaw = String(formData.get("category") ?? "");
  const category = (eventCategoryEnum as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as (typeof eventCategoryEnum)[number])
    : null;

  const preview = await fetchLinkPreview(url);

  await db.insert(curatedLinks).values({
    addedBy: userId,
    sourceUrl: url,
    category,
    ...preview,
  });

  redirect("/curate?added=1");
}

export async function removeCuratedLink(id: string) {
  await requireHost();
  await db.delete(curatedLinks).where(eq(curatedLinks.id, id));
  redirect("/curate?removed=1");
}

const ExtractedEventsSchema = z.object({
  events: z.array(
    z.object({
      url: z.string().describe("The event's registration/RSVP link"),
    }),
  ),
});

export async function addCuratedLinksBulk(formData: FormData) {
  const userId = await requireHost();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    throw new Error("Paste some text first");
  }

  let urls: string[];
  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: ExtractedEventsSchema,
      prompt: `Extract every distinct event link from this text (a social media post or thread listing events — likely Partiful, Luma, or similar RSVP links). Ignore non-event links (profile links, unrelated articles). Return each URL exactly as written.

Text:
"""
${text}
"""`,
    });
    urls = object.events.map((e) => e.url);
  } catch (err) {
    console.error("AI event extraction failed, falling back to raw URL scan:", err);
    urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  }
  urls = [...new Set(urls)];
  if (urls.length === 0) {
    redirect("/curate?bulkEmpty=1");
  }

  const existing = await db.query.curatedLinks.findMany({
    where: inArray(curatedLinks.sourceUrl, urls),
    columns: { sourceUrl: true },
  });
  const existingUrls = new Set(existing.map((e) => e.sourceUrl));
  const newUrls = urls.filter((u) => !existingUrls.has(u));

  const previews = await Promise.all(
    newUrls.map(async (url) => ({ url, preview: await fetchLinkPreview(url) })),
  );

  if (previews.length > 0) {
    await db.insert(curatedLinks).values(
      previews.map(({ url, preview }) => ({
        addedBy: userId,
        sourceUrl: url,
        ...preview,
      })),
    );
  }

  redirect(`/curate?bulkAdded=${previews.length}`);
}
