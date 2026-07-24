import type { ReactNode } from "react";

// The editorial masthead pattern (mono eyebrow → serif title → soft subtitle),
// factored out of the six pages that re-typed it with drifting spacing.
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  back,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {back}
      {eyebrow && (
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-accent">
          {eyebrow}
        </p>
      )}
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground text-balance">
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-sm text-foreground-soft">{subtitle}</p>}
    </header>
  );
}
