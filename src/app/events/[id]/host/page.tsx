import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, registrations } from "@/db/schema";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatusPill } from "@/components/status-pill";
import { generateApplicantRationale, updateRegistrationStatus } from "@/lib/actions/host";
import { composition, reviewApplicants } from "@/lib/cohort";
import { scoreRegistration } from "@/lib/scoring";

const decideButton = "rounded-full px-4 py-2 text-sm font-medium transition-colors";

export default async function HostDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?next=/events/${id}/host`);
  }

  const event = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!event) {
    return (
      <PageShell width="wide">
        <p className="text-foreground-soft">Event not found.</p>
      </PageShell>
    );
  }
  if (event.hostId !== session.user.id) {
    return (
      <PageShell width="wide">
        <p className="text-foreground-soft">You&apos;re not the host of this event.</p>
      </PageShell>
    );
  }

  const rows = await db.query.registrations.findMany({
    where: eq(registrations.eventId, id),
    orderBy: [desc(registrations.compositeScore)],
    with: { user: { with: { profile: true } } },
  });

  // Stored scores are an audit trail of what was shown at decision time; they
  // are never refreshed, so recompute alongside them and surface any drift.
  const liveScores = new Map(
    rows.map((r) => [
      r.id,
      r.user.profile
        ? scoreRegistration(
            { ...r.user.profile, embedding: r.user.profile.embedding },
            { criteriaWeights: event.criteriaWeights, tags: event.tags, embedding: event.embedding },
          )
        : null,
    ]),
  );
  const shownScore = (regId: string, stored: number | null) =>
    liveScores.get(regId)?.composite ?? stored ?? 0;

  // Rank on the number the host is actually shown. The SQL ordering is by the
  // STORED score, so as soon as a profile or event changes, the list renders
  // visibly out of order (72, 68, 80). Re-sort here; id breaks ties so two
  // renders never disagree.
  const regs = [...rows].sort(
    (a, b) =>
      shownScore(b.id, b.compositeScore) - shownScore(a.id, a.compositeScore) ||
      a.id.localeCompare(b.id),
  );

  // Counts each applicant ONCE by their declared primary type. The previous
  // version added 1 to a counter per selected profileType, so one applicant who
  // ticked five boxes was counted five times and the room summary was wrong.
  const typeCounts = composition(
    regs.map((r) => ({ profileType: r.user.profile?.profileType ?? null })),
  );

  // Activates events.typeCaps / events.excludeRules, which have had real
  // host-authored values in the database while being read by nothing. Selection
  // runs on the displayed score for the same reason the list is re-sorted above.
  const review = reviewApplicants(
    event,
    regs.map((r) => ({ registration: r, profile: r.user.profile ?? null })),
    (r) => shownScore(r.registration.id, r.registration.compositeScore),
  );
  const cappedTypes = Object.entries(review.cohort.byType)
    .filter((e): e is [string, { admitted: number; seats: number }] => e[1].seats != null)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Host dashboard"
        title={event.title}
        subtitle={`${regs.length} applicant${regs.length === 1 ? "" : "s"}${
          event.capacity ? ` · capacity ${event.capacity}` : ""
        }`}
      />

      {(Object.keys(typeCounts).length > 0 || cappedTypes.length > 0) && (
        <div className="mb-8 flex flex-col gap-2 text-xs">
          {Object.keys(typeCounts).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground-soft/60">Room</span>
              {Object.entries(typeCounts).map(([type, count]) => (
                <span
                  key={type}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-foreground-soft"
                >
                  {count} {type.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
          {/* Cap usage is a separate reading: an applicant spends a seat from a
              capped type if they declared it, which is not necessarily the type
              they lead with above. Conflating the two mislabels people. */}
          {cappedTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground-soft/60">Caps</span>
              {cappedTypes.map(([type, { admitted, seats }]) => (
                <span
                  key={type}
                  className={`rounded-full border px-3 py-1 ${
                    admitted >= seats
                      ? "border-line bg-surface text-foreground-soft/60"
                      : "border-line bg-surface text-foreground-soft"
                  }`}
                >
                  {type.replace(/_/g, " ")} {admitted}/{seats}
                  {admitted >= seats && <span className="ml-1">full</span>}
                </span>
              ))}
              {review.cohort.unusedSeats > 0 && event.capacity != null && (
                <span className="text-foreground-soft/60">
                  {review.cohort.unusedSeats} seat
                  {review.cohort.unusedSeats === 1 ? "" : "s"} unfilled
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {regs.length === 0 ? (
        <EmptyState eyebrow="No applicants" title="No one has applied to this event yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {regs.map((reg) => {
            const profile = reg.user.profile;
            const decide = updateRegistrationStatus.bind(null, id, reg.id);
            const view = review.perApplicant.get(reg.id);
            const live = liveScores.get(reg.id) ?? null;
            const drifted = live != null && live.composite !== reg.compositeScore;
            return (
              <div key={reg.id} className="rounded-lg border border-line bg-surface p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {profile?.fullName ?? "(no profile)"}
                      </span>
                      <StatusPill status={reg.status} />
                      {view?.cappedOut && (
                        <span
                          className="rounded-full border border-line bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-foreground-soft"
                          title="Ranked high enough, but this type has already filled its cap for the room."
                        >
                          capped out
                        </span>
                      )}
                      {view?.wouldAdmit && (
                        <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                          would admit
                        </span>
                      )}
                    </div>
                    {view?.flags?.length ? (
                      <p className="mt-1 font-mono text-[11px] text-foreground-soft">
                        {view.flags
                          .map((f) => `flag: ${f.rule} (${f.evidence})`)
                          .join(" · ")}
                      </p>
                    ) : null}
                    <p className="truncate text-sm text-foreground-soft">
                      {profile?.title}
                      {profile?.title && profile?.company ? " at " : ""}
                      {profile?.company}
                    </p>
                    {profile?.linkedinUrl && (
                      <a
                        href={profile.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent underline underline-offset-2"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-lg font-semibold tabular-nums">
                      {live?.composite ?? reg.compositeScore}
                    </div>
                    <div className="font-mono text-xs tabular-nums text-foreground-soft/70">
                      struct {live?.structural ?? reg.structuralScore} · match{" "}
                      {live?.semantic ?? reg.semanticScore}
                    </div>
                    {drifted && (
                      <div
                        className="font-mono text-[10px] text-foreground-soft/60"
                        title="Score at the time this person applied. Recomputed above from current data."
                      >
                        was {reg.compositeScore}
                      </div>
                    )}
                  </div>
                </div>

                {profile?.bioBlurb && (
                  <p className="mt-3 text-sm text-foreground">{profile.bioBlurb}</p>
                )}
                {reg.aiRationale ? (
                  <p className="mt-2 text-xs italic text-foreground-soft">{reg.aiRationale}</p>
                ) : (
                  <form action={generateApplicantRationale.bind(null, id, reg.id)} className="mt-2">
                    <button className="text-xs text-accent underline underline-offset-2 hover:text-accent-hover">
                      + Add AI read
                    </button>
                  </form>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={decide.bind(null, "approved")}>
                    <button
                      className={`${decideButton} bg-foreground text-surface hover:bg-accent-hover`}
                    >
                      Approve
                    </button>
                  </form>
                  <form action={decide.bind(null, "waitlisted")}>
                    <button
                      className={`${decideButton} border border-line bg-background text-foreground hover:border-accent/40`}
                    >
                      Waitlist
                    </button>
                  </form>
                  <form action={decide.bind(null, "declined")}>
                    <button
                      className={`${decideButton} border border-line bg-background text-foreground-soft hover:bg-line/40`}
                    >
                      Decline
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
