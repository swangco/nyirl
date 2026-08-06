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
  // The `s` flag is load-bearing: Luma's og:description contains literal
  // newlines, and without it `.` stops at the first one so the pattern fails to
  // match AT ALL and the description comes back null. Measured against live
  // pages, 2 of 3 Luma listings silently lost their entire description this way
  // — the title still worked, because titles are single-line, which is why it
  // went unnoticed. This is the second escape of a truncation bug in this same
  // regex; the first was the apostrophe case described above.
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=(["'])(.*?)\\1`,
      "is",
    ),
    new RegExp(
      `<meta[^>]+content=(["'])(.*?)\\1[^>]+property=["']${property}["']`,
      "is",
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
  /** Organisations credited as running the event, from structured data. Empty
   * when the page publishes none. See extractJsonLdEvent. */
  hostNames: string[];
  /**
   * True when the URL is a CALENDAR INDEX rather than a single event — a page
   * that lists many events. These must not be ingested: every field taken from
   * one describes whichever event happens to be listed first, and that changes
   * as the calendar does. Verified live on luma.com/jointhecollective, whose
   * stored date (2026-07-22) belongs to an event that is no longer even first.
   */
  isCalendarIndex: boolean;
};

/** Luma's default calendar name for an individual — carries no host identity. */
const NON_HOST_NAMES = new Set(["personal", "my calendar", "events"]);

type JsonLdEvent = {
  "@type"?: unknown;
  name?: unknown;
  description?: unknown;
  organizer?: unknown;
};

/**
 * Luma (and Partiful) publish a schema.org Event as `application/ld+json`. It
 * carries two things we otherwise guess at badly:
 *
 *  - the FULL description. og:description is an SEO summary Luma truncates to
 *    ~150 chars with a trailing ellipsis; the JSON-LD copy of the same listing
 *    measured 2,074 chars. Since the profile/link embedding is built from this
 *    text and carries 80% of the ranking weight, embedding the summary means
 *    ranking on a fraction of what the page actually says.
 *
 *  - the ORGANIZER, structured. Host identity is the first thing curation keys
 *    on, and inferring it by scanning prose for company names misattributes
 *    badly: a listing that merely name-drops a well-known company reads as if
 *    that company were hosting.
 */
function extractJsonLdEvent(html: string): {
  description: string | null;
  hostNames: string[];
  /** True when the page is a calendar/listing index rather than one event. */
  isIndex: boolean;
} {
  let isIndex = false;
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue; // a malformed block must not take the whole fetch down
    }
    const candidates = (Array.isArray(parsed) ? parsed : [parsed]) as JsonLdEvent[];
    for (const node of candidates) {
      if (!node || typeof node !== "object") continue;
      // A calendar page publishes ItemList + many Events. Taking fields off it
      // describes whichever event happens to be listed first, which drifts as
      // the calendar changes. luma.com/jointhecollective entered the corpus
      // this way and its stored date belongs to an unrelated event.
      if (node["@type"] === "ItemList") {
        isIndex = true;
        continue;
      }
      // Only a real Event describes THIS page.
      if (node["@type"] !== "Event") continue;
      const organizers = Array.isArray(node.organizer)
        ? node.organizer
        : node.organizer
          ? [node.organizer]
          : [];
      const hostNames = organizers
        .filter(
          (o): o is { "@type"?: string; name?: string } =>
            !!o && typeof o === "object" && typeof (o as { name?: unknown }).name === "string",
        )
        // Organizations only. A Person organiser is the individual who pressed
        // "create event" on someone else's calendar, not the brand being tiered.
        .filter((o) => o["@type"] === "Organization")
        .map((o) => o.name!.trim())
        .filter((n) => n.length > 0 && !NON_HOST_NAMES.has(n.toLowerCase()));
      const description = typeof node.description === "string" ? node.description : null;
      if (description || hostNames.length) {
        return { description, hostNames: [...new Set(hostNames)], isIndex };
      }
    }
  }
  return { description: null, hostNames: [], isIndex };
}

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
    const ld = extractJsonLdEvent(html);
    const og = extractMeta(html, "og:description");
    // Prefer the structured description, but only when it genuinely says more —
    // a page with a stub JSON-LD shouldn't lose us a good og:description.
    const description =
      ld.description && ld.description.length >= (og?.length ?? 0) ? ld.description : og;
    return {
      title: extractMeta(html, "og:title"),
      description,
      imageUrl: extractMeta(html, "og:image"),
      // A calendar index has no date of its own. Returning the first one on the
      // page would silently attribute an unrelated event's date to this row.
      eventDate: ld.isIndex ? null : extractEventDate(html),
      hostNames: ld.hostNames,
      isCalendarIndex: ld.isIndex,
    };
  } catch (err) {
    console.error("Link preview fetch failed:", url, err);
    return {
      title: null, description: null, imageUrl: null, eventDate: null,
      hostNames: [], isCalendarIndex: false,
    };
  }
}
