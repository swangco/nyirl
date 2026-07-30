import { ArrowUpRight, CalendarDays } from "lucide-react";
import { ScoreBadge } from "@/components/score-badge";

export type RecommendationItem = {
  kind: "event" | "link";
  id: string;
  title: string;
  /** For events: the formatted date. For links: source label e.g. "From around town". */
  meta: string;
  description: string | null;
  image: string | null;
  href: string;
  external: boolean;
  score: number | null;
};

/**
 * Shared card for the "Recommended for you" and category lists. Two item
 * types read differently at a glance: hosted NY IRL events carry a solid
 * "NY IRL" pill (they're pinned track record, not scored curation), while
 * external links show an out-arrow. The score stays visible on the right —
 * it's the feature, per the design vision.
 */
export function RecommendationCard({
  item,
  scoreLabel,
}: {
  item: RecommendationItem;
  scoreLabel: string;
}) {
  const isEvent = item.kind === "event";

  return (
    <a
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-foreground/25"
    >
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="h-16 w-16 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-line bg-accent-soft text-foreground-soft">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          {isEvent ? (
            <span className="inline-flex items-center rounded-full bg-foreground px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-surface">
              NY IRL
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground-soft">
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              Curated link
            </span>
          )}
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-foreground-soft">
            {item.meta}
          </span>
        </div>
        <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
          {item.title}
        </h2>
        {item.description && (
          <p className="mt-0.5 truncate text-sm text-foreground-soft">
            {item.description}
          </p>
        )}
      </div>

      {item.score !== null && <ScoreBadge score={item.score} label={scoreLabel} />}
    </a>
  );
}
