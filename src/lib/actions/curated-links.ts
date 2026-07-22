"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks } from "@/db/schema";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function addCuratedLink(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== HOST_USER_ID) {
    throw new Error("Not authorized");
  }

  const url = String(formData.get("url") ?? "").trim();
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error("Enter a valid URL");
  }

  let title: string | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NYIRLBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    title = extractMeta(html, "og:title");
    description = extractMeta(html, "og:description");
    imageUrl = extractMeta(html, "og:image");
  } catch (err) {
    console.error("Link preview fetch failed:", err);
  }

  await db.insert(curatedLinks).values({
    addedBy: session.user.id,
    sourceUrl: url,
    title,
    description,
    imageUrl,
  });

  redirect("/curate?added=1");
}

export async function removeCuratedLink(id: string) {
  const session = await auth();
  if (!session?.user?.id || session.user.id !== HOST_USER_ID) {
    throw new Error("Not authorized");
  }
  await db.delete(curatedLinks).where(eq(curatedLinks.id, id));
  redirect("/curate?removed=1");
}
