import type { MatchExplanation } from "@/lib/explain";

/**
 * The score, taken apart.
 *
 * Deliberately reads like an itemised receipt rather than an analytics
 * dashboard: one bar to scale, then the literal arithmetic, then the line
 * items. No pie charts, no rainbow categorical palette — the page already has
 * one accent, and a score breakdown is a sequence of small honest numbers, not
 * a data-visualisation showcase.
 *
 * Widths are expressed as a share of 100 POINTS OF FINAL SCORE, not as a share
 * of each component's own maximum. That distinction is the whole point: quality
 * looks impressive at 78/100 until you see it is weighted 0.2 and therefore
 * moves the result by 15.6 points at most.
 */

const BAND: Record<MatchExplanation["contributions"][number]["key"], string> = {
  relevance: "bg-accent",
  quality: "bg-cream",
  boosts: "bg-foreground-faint",
};

export function ScoreAnatomy({ ex }: { ex: MatchExplanation }) {
  return (
    <div>
      {/* To-scale bar. Each segment's width is its POINTS, out of 100. */}
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`Score ${ex.score} of 100: ${ex.contributions
          .map((c) => `${c.label} ${Math.round(c.points)}`)
          .join(", ")}`}
      >
        {ex.contributions
          .filter((c) => c.points > 0)
          .map((c) => (
            <div
              key={c.key}
              className={BAND[c.key]}
              style={{ width: `${Math.max(0, Math.min(100, c.points))}%` }}
            />
          ))}
      </div>

      <p className="mt-3 font-mono text-[11px] text-foreground-soft">
        {ex.formula}
        {ex.clamped && <span className="ml-2 text-accent">(clamped to 0–100)</span>}
      </p>

      <dl className="mt-4 flex flex-col gap-2.5">
        {ex.contributions.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex items-center gap-2">
                <span className={`inline-block size-2 rounded-full ${BAND[c.key]}`} />
                <span className="text-sm text-foreground">{c.label}</span>
              </dt>
              <dd className="shrink-0 font-mono text-xs tabular-nums text-foreground-soft">
                {c.key === "boosts" ? (
                  <>+{c.points.toFixed(1).replace(/\.0$/, "")} pts</>
                ) : (
                  <>
                    {c.raw}
                    <span className="text-foreground-faint">/100</span>
                    {" × "}
                    {c.weight}
                    {" = "}
                    <span className="text-foreground">{c.points.toFixed(1)}</span>
                    {" pts"}
                  </>
                )}
              </dd>
            </div>
            <p className="mt-1 max-w-prose pl-4 text-xs leading-relaxed text-pretty text-foreground-soft">
              {c.explanation}
            </p>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The five editorial quality components, each as earned-out-of-possible. */
export function QualityLedger({ ex }: { ex: MatchExplanation }) {
  const total = ex.quality.reduce((a, q) => a + q.earned, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-soft">
          Event quality
        </h3>
        <span className="font-mono text-xs tabular-nums text-foreground-soft">
          {total}
          <span className="text-foreground-faint">/100</span>
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {ex.quality.map((q) => (
          <li key={q.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-foreground">{q.label}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground-soft">
                {q.earned}
                <span className="text-foreground-faint">/{q.max}</span>
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line">
              <div
                className={q.earned > 0 ? "h-full rounded-full bg-accent/60" : "h-full"}
                style={{ width: `${q.max ? (q.earned / q.max) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-foreground-soft">{q.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the two sides demonstrably have in common. */
export function CommonGround({ ex }: { ex: MatchExplanation }) {
  const { interests, tags, keywords } = ex.overlap;
  const nothing = !interests.length && !tags.length && !keywords.length;
  return (
    <div>
      <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-soft">
        Common ground
      </h3>
      {ex.relevanceSource === "semantic" && (
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-pretty text-foreground-soft">
          The match score comes from comparing whole documents, so these shared
          terms are <em>context, not the cause</em> — the model can match two
          listings that share no words at all.
        </p>
      )}
      {nothing ? (
        <p className="mt-3 text-sm text-foreground-soft">
          Nothing shared on the surface.{" "}
          {ex.relevanceSource === "semantic"
            ? "Any match here is purely semantic."
            : "With no vector available, that means the score is near the floor."}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {interests.length > 0 && <ChipRow label="Interests" items={interests} strong />}
          {tags.length > 0 && <ChipRow label="Tags" items={tags} />}
          {keywords.length > 0 && <ChipRow label="Words in both" items={keywords} />}
        </div>
      )}
    </div>
  );
}

function ChipRow({
  label,
  items,
  strong = false,
}: {
  label: string;
  items: string[];
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground-faint">
        {label}
      </span>
      {items.map((i) => (
        <span
          key={i}
          className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
            strong
              ? "border-accent/30 bg-accent-soft text-accent"
              : "border-line bg-background text-foreground-soft"
          }`}
        >
          {i.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

/** Where the host came from — declared, guessed, or absent. */
export function HostProvenance({ ex }: { ex: MatchExplanation }) {
  const { key, declaredNames, source } = ex.host;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-foreground-faint">
        Host
      </span>
      {declaredNames.length > 0 ? (
        declaredNames.map((n) => (
          <span
            key={n}
            className="rounded-full border border-line bg-background px-2 py-0.5 text-foreground"
          >
            {n}
          </span>
        ))
      ) : (
        <span className="text-foreground-soft">none published on the listing</span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
          source === "declared"
            ? "bg-accent-soft text-accent"
            : source === "inferred"
              ? "border border-line bg-background text-foreground-soft"
              : "border border-line bg-background text-foreground-faint"
        }`}
        title={
          source === "declared"
            ? "Read from the listing's structured data — reliable."
            : source === "inferred"
              ? "Guessed from the words on the page — the listing published no organiser."
              : "No tier-1 host recognised."
        }
      >
        {source === "declared"
          ? `tier 1 · ${key}`
          : source === "inferred"
            ? `tier 1 · ${key} (guessed)`
            : "not tier 1"}
      </span>
    </div>
  );
}
