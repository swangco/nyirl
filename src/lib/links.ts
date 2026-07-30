type ItemKind = "event" | "link";

/**
 * Builds a click-tracking redirect URL through /api/out, so outbound clicks
 * become interaction signal (Stage 0). /api/out derives the actual redirect
 * target server-side from (id, kind) — it is NOT passed here — so the endpoint
 * can only ever send users to a real curated item, never an arbitrary URL.
 * Relative by default for on-site use; pass `base` (the absolute app origin)
 * for emails, which need absolute links. `uid` attributes digest clicks, which
 * arrive from email with no session.
 */
export function trackedHref(opts: {
  id: string;
  kind: ItemKind;
  source: string;
  uid?: string | null;
  base?: string;
}): string {
  const params = new URLSearchParams({
    id: opts.id,
    kind: opts.kind,
    source: opts.source,
  });
  if (opts.uid) params.set("uid", opts.uid);
  const path = `/api/out?${params.toString()}`;
  return opts.base ? new URL(path, opts.base).toString() : path;
}
