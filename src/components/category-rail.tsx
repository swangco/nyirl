"use client";

import Link from "next/link";
import { useState } from "react";

export type CategoryRailItem = {
  href: string;
  label: string;
  count: number;
  active: boolean;
};

// Left-margin category filter for /discover (§A5). Selecting an item sets
// ?category= and lets the server component re-render the same ranked list
// scoped to it — this component only owns the "More" overflow toggle, not
// navigation state.
export function CategoryRail({
  all,
  items,
}: {
  all: CategoryRailItem;
  items: CategoryRailItem[];
}) {
  const CAP = 12;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, CAP);
  const hasOverflow = items.length > CAP;

  return (
    <aside className="w-full shrink-0 lg:w-[164px] lg:border-r lg:border-line lg:pr-6">
      <p className="mb-3 hidden font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-soft lg:block">
        Browse
      </p>

      {/* Mobile/tablet: horizontal snap-scroll chip strip (§A7), reusing the
          techWeek row's snap pattern. Same items, sort, and cap as desktop —
          this is a presentation swap at the breakpoint, not a second list. */}
      <nav
        aria-label="Browse categories"
        className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6 lg:hidden"
      >
        <RailChip {...all} />
        {visible.map((item) => (
          <RailChip key={item.href} {...item} />
        ))}
        {hasOverflow && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="shrink-0 snap-start whitespace-nowrap rounded-full border border-line px-3 py-1.5 font-sans text-xs text-accent transition-colors hover:text-accent-hover"
          >
            More
          </button>
        )}
      </nav>

      {/* Desktop: vertical list with a terracotta left indicator on the active item. */}
      <nav aria-label="Browse categories" className="hidden flex-col gap-0.5 lg:flex">
        <RailLink {...all} />
        {visible.map((item) => (
          <RailLink key={item.href} {...item} />
        ))}
        {hasOverflow && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1 inline-flex w-fit items-center py-1.5 pl-3 text-left text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            More
          </button>
        )}
      </nav>
    </aside>
  );
}

function RailLink({ href, label, count, active }: CategoryRailItem) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 border-l-2 py-1.5 pl-3 text-sm transition-colors ${
        active
          ? "border-accent font-medium text-foreground"
          : "border-transparent text-foreground-soft hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-[11px] text-foreground-faint">{count}</span>
    </Link>
  );
}

function RailChip({ href, label, count, active }: CategoryRailItem) {
  return (
    <Link
      href={href}
      className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-3 py-1.5 font-sans text-xs transition-colors ${
        active
          ? "border-accent bg-cream font-medium text-foreground"
          : "border-line text-foreground-soft hover:border-accent/40 hover:text-foreground"
      }`}
    >
      {label}
      <span className="ml-1.5 font-mono text-[10px] text-foreground-faint">{count}</span>
    </Link>
  );
}
