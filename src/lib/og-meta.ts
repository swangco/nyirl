/** Decodes the handful of HTML entities that commonly show up in scraped
 * og:title/description text (apostrophes, ampersands, quotes). Keeps the text
 * clean for display, keyword matching, and embedding. &amp; is decoded last so
 * a double-encoded "&amp;#39;" doesn't collapse incorrectly. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2f;/gi, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function extractMeta(html: string, property: string): string | null {
  // The content value ends at whichever quote character opened it — capture the
  // opening quote and match to the same one via a backreference. The previous
  // `[^"']*` capture stopped at the first apostrophe, truncating any title or
  // description containing one (e.g. "Serena's Dinner" -> "Serena").
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=(["'])(.*?)\\1`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=(["'])(.*?)\\1[^>]+property=["']${property}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[2]);
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
