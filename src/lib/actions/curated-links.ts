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
  if (!(eventCategoryEnum as readonly string[]).includes(categoryRaw)) {
    throw new Error("Pick a category");
  }
  const category = categoryRaw as (typeof eventCategoryEnum)[number];

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
      category: z
        .enum(eventCategoryEnum)
        .describe("Best-fit category for this specific event based on its context in the text"),
    }),
  ),
});

export async function addCuratedLinksBulk(formData: FormData) {
  const userId = await requireHost();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    throw new Error("Paste some text first");
  }

  let extracted: { url: string; category: (typeof eventCategoryEnum)[number] }[];
  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: ExtractedEventsSchema,
      prompt: `Extract every distinct event link from this text (a social media post or thread listing events — likely Partiful, Luma, or similar RSVP links). Ignore non-event links (profile links, unrelated articles). Return each URL exactly as written, along with the single best-fit category for that specific event based on how it's described.

Text:
"""
${text}
"""`,
    });
    extracted = object.events;
  } catch (err) {
    console.error("AI event extraction failed, falling back to raw URL scan:", err);
    const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
    // No categorization signal without the AI call — "networking" is the
    // safest generic bucket; the host can curate further from there.
    extracted = urls.map((url) => ({ url, category: "networking" as const }));
  }

  const byUrl = new Map(extracted.map((e) => [e.url, e.category]));
  const urls = [...byUrl.keys()];
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
        category: byUrl.get(url)!,
        ...preview,
      })),
    );
  }

  redirect(`/curate?bulkAdded=${previews.length}`);
}
