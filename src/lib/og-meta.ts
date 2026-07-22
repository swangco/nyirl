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
};

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
    };
  } catch (err) {
    console.error("Link preview fetch failed:", url, err);
    return { title: null, description: null, imageUrl: null };
  }
}
