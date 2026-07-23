import type { ReactNode } from "react";

// Editorial fit indicator — a tier word above a restrained number, instead of a
// bare right-aligned metric that reads like a leaked algorithm grade. The "why"
// is shown separately as a ReasonChip in the card body so it isn't cramped.
export function FitScore({ score, tier }: { score: number; tier: string }) {
  return (
    <div className="shrink-0 text-right">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-foreground-soft/70">
        {tier}
      </div>
      <div className="font-mono text-lg font-semibold tabular-nums text-foreground">
        {score}
      </div>
    </div>
  );
}

// A single plain-language reason an item was surfaced (e.g. "matches your
// profile · notable host"), rendered as a quiet mono chip.
export function ReasonChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-line bg-background px-2.5 py-0.5 font-mono text-[11px] text-foreground-soft">
      {children}
    </span>
  );
}
