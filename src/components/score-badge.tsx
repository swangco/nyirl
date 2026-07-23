/**
 * The algorithmic fit/quality score is a feature, not something to hide —
 * it reinforces that NY IRL is a real matching engine. Rendered as a
 * confident monospace badge with a subtle tier treatment.
 */
export function ScoreBadge({
  score,
  label,
}: {
  score: number;
  label: string;
}) {
  const strong = score >= 80;

  return (
    <div
      className={[
        "flex shrink-0 flex-col items-center justify-center rounded-md border px-2.5 py-1.5 text-center tabular-nums",
        strong
          ? "border-foreground/20 bg-foreground text-surface"
          : "border-line bg-surface text-foreground",
      ].join(" ")}
    >
      <span className="font-mono text-lg font-semibold leading-none">
        {score}
      </span>
      <span
        className={[
          "mt-1 font-mono text-[9px] uppercase tracking-[0.12em]",
          strong ? "text-surface/70" : "text-foreground-soft",
        ].join(" ")}
      >
        {label}
      </span>
    </div>
  );
}
