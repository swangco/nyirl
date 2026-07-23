import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, registrations } from "@/db/schema";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { StatusPill } from "@/components/status-pill";
import { updateRegistrationStatus } from "@/lib/actions/host";

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

  const regs = await db.query.registrations.findMany({
    where: eq(registrations.eventId, id),
    orderBy: [desc(registrations.compositeScore)],
    with: { user: { with: { profile: true } } },
  });

  const typeCounts: Record<string, number> = {};
  for (const reg of regs) {
    for (const t of reg.user.profile?.profileType ?? []) {
      typeCounts[t] = (typeCounts[t] ?? 0) + 1;
    }
  }

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Host dashboard"
        title={event.title}
        subtitle={`${regs.length} applicant${regs.length === 1 ? "" : "s"}${
          event.capacity ? ` · capacity ${event.capacity}` : ""
        }`}
      />

      {Object.keys(typeCounts).length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2 text-xs">
          {Object.entries(typeCounts).map(([type, count]) => (
            <span
              key={type}
              className="rounded-full border border-line bg-surface px-3 py-1 text-foreground-soft"
            >
              {count} {type}
            </span>
          ))}
        </div>
      )}

      {regs.length === 0 ? (
        <EmptyState eyebrow="No applicants" title="No one has applied to this event yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {regs.map((reg) => {
            const profile = reg.user.profile;
            const decide = updateRegistrationStatus.bind(null, id, reg.id);
            return (
              <div key={reg.id} className="rounded-lg border border-line bg-surface p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {profile?.fullName ?? "(no profile)"}
                      </span>
                      <StatusPill status={reg.status} />
                    </div>
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
                      {reg.compositeScore}
                    </div>
                    <div className="font-mono text-xs tabular-nums text-foreground-soft/70">
                      struct {reg.structuralScore} · ai {reg.semanticScore}
                    </div>
                  </div>
                </div>

                {profile?.bioBlurb && (
                  <p className="mt-3 text-sm text-foreground">{profile.bioBlurb}</p>
                )}
                {reg.aiRationale && (
                  <p className="mt-2 text-xs italic text-foreground-soft">{reg.aiRationale}</p>
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
