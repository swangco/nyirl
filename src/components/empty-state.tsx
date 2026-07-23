import Link from "next/link";
import type { ReactNode } from "react";

// A branded, actionable empty state — replaces the lone gray "Nothing yet."
// sentences that dead-ended. Keeps the editorial voice and offers a way onward.
export function EmptyState({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      {eyebrow && (
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-foreground-soft/70">
          {eyebrow}
        </p>
      )}
      <p className="font-serif text-lg text-foreground text-balance">{title}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
