"use server";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  curatedLinks,
  eventCategoryEnum,
  linkExclusivityEnum,
  linkFormatEnum,
} from "@/db/schema";
import { buildLinkDocument, embedText, embedTexts } from "@/lib/embeddings";
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

  const eventDateRaw = String(formData.get("eventDate") ?? "");
  if (!eventDateRaw) {
    throw new Error("Enter the event's date");
  }
  const eventDate = new Date(eventDateRaw);
  if (Number.isNaN(eventDate.getTime())) {
    throw new Error("Enter a valid event date");
  }

  const exclusivityRaw = String(formData.get("exclusivity") ?? "capped");
  const exclusivity = (linkExclusivityEnum as readonly string[]).includes(exclusivityRaw)
    ? (exclusivityRaw as (typeof linkExclusivityEnum)[number])
    : "capped";

  const formatRaw = String(formData.get("format") ?? "mixer");
  const format = (linkFormatEnum as readonly string[]).includes(formatRaw)
    ? (formatRaw as (typeof linkFormatEnum)[number])
    : "mixer";

  const outOfTown = formData.get("outOfTown") === "on";

  const preview = await fetchLinkPreview(url);

  const embedding = await embedText(
    buildLinkDocument({
      title: preview.title,
      description: preview.description,
      category,
      format,
      tags: null,
    }),
  );

  await db.insert(curatedLinks).values({
    addedBy: userId,
    sourceUrl: url,
    category,
    exclusivity,
    format,
    outOfTown,
    title: preview.title,
    description: preview.description,
    imageUrl: preview.imageUrl,
    // Scraped date is more reliable than a manually typed one when found —
    // fall back to what the host entered otherwise.
    eventDate: preview.eventDate ?? eventDate,
    ...(embedding ? { embedding } : {}),
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
      eventDate: z
        .string()
        .nullable()
        .describe(
          "The event's date as YYYY-MM-DD if stated or clearly inferable from the text, otherwise null",
        ),
      exclusivity: z
        .enum(linkExclusivityEnum)
        .describe(
          "'invite_only' if described as private/invite-only, 'open' if a large public/free-for-all event, otherwise 'capped' (the default for a normal RSVP-capped Luma/Partiful listing)",
        ),
      format: z
        .enum(linkFormatEnum)
        .describe(
          "'dinner' for a dinner/salon/small intimate gathering, 'hackathon' for a hackathon, 'workshop' for a workshop/panel/talk/speaker series, 'expo' for a fair/conference/large expo, otherwise 'mixer' (the default for a happy hour/game night/general social)",
        ),
    }),
  ),
});

type ExtractedEvent = z.infer<typeof ExtractedEventsSchema>["events"][number];

export async function addCuratedLinksBulk(formData: FormData) {
  const userId = await requireHost();

  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    throw new Error("Paste some text first");
  }

  let extracted: ExtractedEvent[];
  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: ExtractedEventsSchema,
      prompt: `Extract every distinct event link from this text (a social media post or thread listing events — likely Partiful, Luma, or similar RSVP links). Ignore non-event links (profile links, unrelated articles). For each one, return the URL exactly as written, its best-fit category, its date if stated, its exclusivity, and its format.

Text:
"""
${text}
"""`,
    });
    extracted = object.events;
  } catch (err) {
    console.error("AI event extraction failed, falling back to raw URL scan:", err);
    const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
    // No categorization signal without the AI call — safe, neutral defaults;
    // the host can curate further from there.
    extracted = urls.map((url) => ({
      url,
      category: "networking" as const,
      eventDate: null,
      exclusivity: "capped" as const,
      format: "mixer" as const,
    }));
  }

  const byUrl = new Map(extracted.map((e) => [e.url, e]));
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
    // One batched embedding call for the whole insert (index-aligned with previews).
    const embeddings = await embedTexts(
      previews.map(({ url, preview }) => {
        const event = byUrl.get(url)!;
        return buildLinkDocument({
          title: preview.title,
          description: preview.description,
          category: event.category,
          format: event.format,
          tags: null,
        });
      }),
    );

    await db.insert(curatedLinks).values(
      previews.map(({ url, preview }, i) => {
        const event = byUrl.get(url)!;
        const aiGuessedDate = event.eventDate ? new Date(event.eventDate) : null;
        const validAiGuess =
          aiGuessedDate && !Number.isNaN(aiGuessedDate.getTime()) ? aiGuessedDate : null;
        const embedding = embeddings[i];
        return {
          addedBy: userId,
          sourceUrl: url,
          category: event.category,
          exclusivity: event.exclusivity,
          format: event.format,
          title: preview.title,
          description: preview.description,
          imageUrl: preview.imageUrl,
          // Scraped date beats the AI's guess from the pasted text, which
          // beats nothing at all.
          eventDate: preview.eventDate ?? validAiGuess,
          ...(embedding ? { embedding } : {}),
        };
      }),
    );
  }

  redirect(`/curate?bulkAdded=${previews.length}`);
}
