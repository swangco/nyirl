import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, registrations } from "@/db/schema";
import { updateRegistrationStatus } from "@/lib/actions/host";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-line/60 text-foreground-soft",
  approved: "bg-emerald-100 text-emerald-800",
  waitlisted: "bg-amber-100 text-amber-800",
  declined: "bg-rose-100 text-rose-800",
  attended: "bg-sky-100 text-sky-800",
};

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
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-foreground-soft">Event not found.</p>
      </main>
    );
  }
  if (event.hostId !== session.user.id) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-foreground-soft">You&apos;re not the host of this event.</p>
      </main>
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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Host dashboard
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-2">
        {event.title}
      </h1>
      <p className="text-sm text-foreground-soft mb-4">
        {regs.length} applicant{regs.length === 1 ? "" : "s"}
        {event.capacity ? ` · capacity ${event.capacity}` : ""}
      </p>

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

      <div className="flex flex-col gap-3">
        {regs.map((reg) => {
          const profile = reg.user.profile;
          const decide = updateRegistrationStatus.bind(null, id, reg.id);
          return (
            <div
              key={reg.id}
              className="rounded-lg border border-line bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {profile?.fullName ?? "(no profile)"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${STATUS_STYLES[reg.status]}`}
                    >
                      {reg.status}
                    </span>
                  </div>
                  <p className="text-sm text-foreground-soft">
                    {profile?.title}
                    {profile?.title && profile?.company ? " at " : ""}
                    {profile?.company}
                  </p>
                  {profile?.linkedinUrl && (
                    <a
                      href={profile.linkedinUrl}
                      target="_blank"
                      className="text-xs text-accent underline underline-offset-2"
                    >
                      LinkedIn
                    </a>
                  )}
                </div>
                <div className="text-right">
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
                <p className="mt-2 text-xs italic text-foreground-soft">
                  {reg.aiRationale}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <form action={decide.bind(null, "approved")}>
                  <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                    Approve
                  </button>
                </form>
                <form action={decide.bind(null, "waitlisted")}>
                  <button className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600">
                    Waitlist
                  </button>
                </form>
                <form action={decide.bind(null, "declined")}>
                  <button className="rounded-md border border-line bg-background px-3 py-1.5 text-xs font-medium text-foreground-soft hover:bg-line/40">
                    Decline
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {regs.length === 0 && (
          <p className="text-sm text-foreground-soft">No applicants yet.</p>
        )}
      </div>
    </main>
  );
}
