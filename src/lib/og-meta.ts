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

export type LinkPreview = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  eventDate: Date | null;
};

/**
 * Luma doesn't expose the event date via og:meta — it's buried in an
 * embedded JSON blob the page hydrates from. Two field names show up
 * depending on which page template a given event landed on: "startDate"
 * (with a timezone offset) on newer pages, "start_at" (UTC) on older ones.
 */
function extractEventDate(html: string): Date | null {
  const startDate = html.match(/"startDate":"([^"]+)"/);
  if (startDate) {
    const date = new Date(startDate[1]);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const startAt = html.match(/"start_at":"([^"]+)"/);
  if (startAt) {
    const date = new Date(startAt[1]);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NYIRLBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    return {
      title: extractMeta(html, "og:title"),
      description: extractMeta(html, "og:description"),
      imageUrl: extractMeta(html, "og:image"),
      eventDate: extractEventDate(html),
    };
  } catch (err) {
    console.error("Link preview fetch failed:", url, err);
    return { title: null, description: null, imageUrl: null, eventDate: null };
  }
}
