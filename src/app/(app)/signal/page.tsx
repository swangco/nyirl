import { gte } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import {
  CommonGround,
  HostProvenance,
  QualityLedger,
  ScoreAnatomy,
} from "@/components/signal/score-anatomy";
import { explainMatch, type MatchExplanation } from "@/lib/explain";
import { SANDBOX_PEOPLE, buildSandbox } from "@/lib/signal-sandbox";
import { SCORE_WEIGHTS } from "@/lib/scoring";

/**
 * Signal inspector — why any event scored what it did, for any person.
 *
 * Exists because the ranking is otherwise a black box with a number on it.
 * Every claim on this page is computed by the real scoring functions (via
 * lib/explain), never re-derived, so it cannot drift from what the feed shows.
 *
 * Two modes:
 *  - LIVE     real curated links against a real profile.
 *  - SANDBOX  a fixed synthetic cast whose similarity is pinned exactly, so the
 *             whole range (score 4 to 93, semantic and keyword paths, boosts on
 *             and off) is reachable on demand. Nothing synthetic is persisted.
 *
 * State lives in the URL, so the page is a server component with no client
 * JavaScript and any view is a shareable link.
 */
export const dynamic = "force-dynamic";

type Row = { id: string; title: string; sub: string; note?: string; ex: MatchExplanation };

export default async function SignalPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; person?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?next=/signal");

  const sp = await searchParams;
  const mode = sp.mode === "live" ? "live" : "sandbox";
  const personId = sp.person ?? SANDBOX_PEOPLE[0].id;

  let rows: Row[] = [];
  let personLabel = "";
  let personNote = "";
  let people: { id: string; label: string }[] = [];
  let inventory: {
    total: number; upcoming: number; noDate: number; thinDescription: number;
  } | null = null;

  if (mode === "sandbox") {
    const { person, rows: sandboxRows } = buildSandbox(personId);
    personLabel = person.label;
    personNote = person.note;
    people = SANDBOX_PEOPLE.map((p) => ({ id: p.id, label: p.label }));
    rows = sandboxRows.map(({ event, profile, link }) => ({
      id: event.id,
      title: link.title ?? event.label,
      sub: event.label,
      note: event.note,
      ex: explainMatch(profile, link),
    }));
  } else {
    const profiles = await db.query.profiles.findMany();
    people = profiles.map((p) => ({ id: p.userId, label: p.fullName || "(unnamed)" }));
    const profile = profiles.find((p) => p.userId === sp.person) ?? profiles[0];
    if (profile) {
      personLabel = profile.fullName || "(unnamed)";
      personNote = [profile.title, profile.company].filter(Boolean).join(" · ");
      const links = await db.query.curatedLinks.findMany({
        where: gte(curatedLinks.eventDate, new Date(0)),
      });
      const now = new Date();
      inventory = {
        total: links.length,
        upcoming: links.filter((l) => l.eventDate && l.eventDate >= now).length,
        noDate: links.filter((l) => !l.eventDate).length,
        thinDescription: links.filter((l) => (l.description ?? "").length < 200).length,
      };
      rows = links.map((link) => ({
        id: link.id,
        title: link.title || link.sourceUrl,
        sub: (link.hostNames ?? []).join(" + ") || "host not published",
        ex: explainMatch(profile, link),
      }));
    }
  }

  rows.sort((a, b) => b.ex.sortKey - a.ex.sortKey);
  const activePerson = mode === "sandbox" ? personId : (sp.person ?? people[0]?.id);

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Signal inspector"
        title="Why this matched"
        subtitle={`Every number below is produced by the live scoring code, not a re-implementation. Final score = ${SCORE_WEIGHTS.relevance} × match + ${SCORE_WEIGHTS.quality} × quality + boosts.`}
      />

      {/* --- controls ------------------------------------------------------ */}
      <div className="mb-8 flex flex-col gap-4 border-y border-line py-4">
        <Segment label="Data">
          <Pill href={`/signal?mode=sandbox`} active={mode === "sandbox"}>
            Sandbox
          </Pill>
          <Pill href={`/signal?mode=live`} active={mode === "live"}>
            Live
          </Pill>
        </Segment>
        <Segment label={mode === "sandbox" ? "Test person" : "Person"}>
          {people.map((p) => (
            <Pill
              key={p.id}
              href={`/signal?mode=${mode}&person=${encodeURIComponent(p.id)}`}
              active={p.id === activePerson}
            >
              {p.label}
            </Pill>
          ))}
        </Segment>
      </div>

      {/* The number that dominates everything else on this page. The feed filters
          on eventDate >= now, so a catalogue full of past events ranks nothing —
          no amount of scoring work matters if there is nothing to score. */}
      {inventory && (
        <div
          className={`mb-8 rounded-lg border p-4 sm:p-5 ${
            inventory.upcoming < 5
              ? "border-accent/40 bg-accent-soft"
              : "border-line bg-surface"
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-soft">
              Inventory
            </span>
            <Stat n={inventory.upcoming} of={inventory.total} label="upcoming" emphasis />
            <Stat n={inventory.noDate} of={inventory.total} label="no date" />
            <Stat n={inventory.thinDescription} of={inventory.total} label="thin description" />
          </div>
          {inventory.upcoming < 5 && (
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-pretty text-foreground">
              Only <strong>{inventory.upcoming}</strong> of {inventory.total} curated
              links are still upcoming — the feed filters on{" "}
              <code className="font-mono text-xs">eventDate ≥ now</code>, so that is
              the entire ranked list a signed-in visitor sees. Ranking quality
              cannot matter more than having something to rank. New links are the
              binding constraint right now, not the scoring.
            </p>
          )}
        </div>
      )}

      {personLabel && (
        <div className="mb-6">
          <h2 className="font-serif text-xl text-foreground">{personLabel}</h2>
          {personNote && (
            <p className="mt-1 max-w-prose text-sm text-pretty text-foreground-soft">
              {personNote}
            </p>
          )}
          {mode === "sandbox" && (
            <p className="mt-2 font-mono text-[11px] text-foreground-faint">
              Synthetic. Similarity is pinned exactly, so this view is identical on every run.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-foreground-soft">Nothing to score yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id}>
              <details className="group rounded-lg border border-line bg-surface transition-colors open:border-accent/25">
                <summary className="flex cursor-pointer list-none items-center gap-4 p-4 sm:p-5">
                  <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-foreground-faint">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {r.title}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-foreground-soft">
                      {r.sub}
                    </span>
                  </span>
                  <MiniBar ex={r.ex} />
                  <span className="w-10 shrink-0 text-right font-mono text-xl font-semibold tabular-nums text-foreground">
                    {r.ex.score}
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 font-mono text-xs text-foreground-faint transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                </summary>

                <div className="border-t border-line px-4 pb-5 pt-4 sm:px-5">
                  {r.note && (
                    <p className="mb-4 rounded-md bg-background px-3 py-2 font-mono text-[11px] text-foreground-soft">
                      {r.note}
                    </p>
                  )}
                  <div className="mb-5">
                    <HostProvenance ex={r.ex} />
                  </div>
                  <ScoreAnatomy ex={r.ex} />
                  <div className="mt-6 grid gap-6 border-t border-line pt-5 sm:grid-cols-2">
                    <QualityLedger ex={r.ex} />
                    <CommonGround ex={r.ex} />
                  </div>
                  {r.ex.boosts.length > 0 && (
                    <div className="mt-5 border-t border-line pt-4">
                      <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-soft">
                        Boosts applied
                      </h3>
                      <ul className="mt-2 flex flex-col gap-1">
                        {r.ex.boosts.map((b) => (
                          <li key={b.label} className="flex items-baseline justify-between gap-3">
                            <span className="text-sm text-foreground">
                              {b.label}{" "}
                              <span className="text-foreground-soft">— {b.detail}</span>
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-accent">
                              +{b.points.toFixed(1).replace(/\.0$/, "")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
}

/** Collapsed-row bar — the same proportions as the expanded one, at a glance. */
function MiniBar({ ex }: { ex: MatchExplanation }) {
  const seg = [
    { w: ex.contributions[0].points, c: "bg-accent" },
    { w: ex.contributions[1].points, c: "bg-cream" },
    { w: ex.contributions[2].points, c: "bg-foreground-faint" },
  ];
  return (
    <span className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-line sm:flex">
      {seg
        .filter((s) => s.w > 0)
        .map((s, i) => (
          <span key={i} className={s.c} style={{ width: `${Math.min(100, s.w)}%` }} />
        ))}
    </span>
  );
}

function Stat({
  n,
  of,
  label,
  emphasis = false,
}: {
  n: number;
  of: number;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={`font-mono tabular-nums ${
          emphasis ? "text-xl font-semibold text-foreground" : "text-sm text-foreground"
        }`}
      >
        {n}
        <span className="text-foreground-faint">/{of}</span>
      </span>
      <span className="text-xs text-foreground-soft">{label}</span>
    </span>
  );
}

function Segment({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground-faint">
        {label}
      </span>
      {children}
    </div>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-accent bg-accent text-surface"
          : "border-line bg-surface text-foreground-soft hover:border-accent/40 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
