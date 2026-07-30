import Link from "next/link";
import type { ReactNode } from "react";

// The /discover row (§A5) — deliberately not ListingCard. Rows are separated
// by hairlines with no radius, fill, or border box, so the screen reads as
// editorial rather than a feed. ListingCard stays the shared component for
// every other surface (Applied, profile, category).
export function DiscoverRow({
  href,
  external,
  image,
  eyebrow,
  title,
  description,
  chip,
  score,
}: {
  href: string;
  external?: boolean;
  image?: string | null;
  eyebrow?: string;
  title: string;
  description?: string | null;
  chip?: ReactNode;
  /** Right-aligned FitScore slot. */
  score?: ReactNode;
}) {
  const className = "group flex items-start gap-4 py-5 first:pt-0";

  const inner = (
    <>
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-cream">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <MarkGlyph />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground-soft">
            {eyebrow}
          </p>
        )}
        <h2 className="flex items-start gap-1 font-serif text-[15px] font-semibold text-foreground">
          <span className="group-hover:text-accent-hover">{title}</span>
          {external && <ExternalGlyph />}
        </h2>
        {description && (
          <p className="mt-1 line-clamp-2 font-sans text-xs text-foreground-soft">
            {description}
          </p>
        )}
        {chip && <div className="mt-2">{chip}</div>}
      </div>
      {score && <div className="shrink-0">{score}</div>}
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

function ExternalGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="mt-1 h-2.5 w-2.5 shrink-0 text-foreground-soft"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" />
    </svg>
  );
}

// Placeholder glyph for hosted rows without an image. A4/step 7 introduces the
// real skyline mark as public/mark-dark.svg; swap this for that asset then.
function MarkGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 text-foreground-soft/60"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-7h6v7" />
    </svg>
  );
}
