import Link from "next/link";
import type { ReactNode } from "react";

// The one card used across Discover, category, profile, and applications — a
// single definition so padding, radius, hover, focus, and text clamping can't
// drift between surfaces (they used to). Renders as an <a> for external links
// (curated links) and a <Link> for on-site routes.
export function ListingCard({
  href,
  external,
  image,
  eyebrow,
  title,
  description,
  chip,
  aside,
}: {
  href: string;
  external?: boolean;
  image?: string | null;
  eyebrow?: string;
  title: string;
  description?: string | null;
  /** Small reason/meta chip shown under the description. */
  chip?: ReactNode;
  /** Right-aligned slot (e.g. a FitScore). */
  aside?: ReactNode;
}) {
  const className =
    "flex items-start gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent/40 sm:p-5";

  const inner = (
    <>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-accent">
            {eyebrow}
          </p>
        )}
        <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 line-clamp-2 text-sm text-foreground-soft">{description}</p>
        )}
        {chip && <div className="mt-2">{chip}</div>}
      </div>
      {aside}
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
