import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { events, profiles } from "@/db/schema";
import { computeStructuralScore } from "@/lib/scoring";

export default async function EventsPage() {
  const session = await auth();

  const allEvents = await db.query.events.findMany({
    orderBy: [asc(events.date)],
  });

  const profile = session?.user?.id
    ? await db.query.profiles.findFirst({
        where: eq(profiles.userId, session.user.id),
      })
    : null;

  const eventsWithFit = allEvents.map((event) => ({
    event,
    fit: profile
      ? computeStructuralScore(profile, event.criteriaWeights)
      : null,
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Discover
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-2">
        Upcoming events
      </h1>
      <p className="text-sm text-foreground-soft mb-8">
        {profile
          ? "Ranked by fit against your profile."
          : "Sign in to see how well each event fits you."}
      </p>

      <div className="flex flex-col gap-3">
        {eventsWithFit.map(({ event, fit }) => (
          <Link
            key={event.id}
            href={`/events/${event.id}/apply`}
            className="block rounded-lg border border-line bg-surface p-5 transition-colors hover:border-accent/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent mb-1">
                  {event.date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <h2 className="font-serif text-xl font-semibold">
                  {event.title}
                </h2>
                {event.description && (
                  <p className="mt-1 text-sm text-foreground-soft">
                    {event.description}
                  </p>
                )}
              </div>
              {fit !== null && (
                <div className="shrink-0 text-right">
                  <div className="font-mono text-lg font-semibold tabular-nums">
                    {fit}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-foreground-soft/70">
                    fit
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}
        {allEvents.length === 0 && (
          <p className="text-sm text-foreground-soft">
            No events listed yet.
          </p>
        )}
      </div>

      {!profile && (
        <Link
          href="/sign-in"
          className="mt-8 inline-block rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Sign in to see your fit
        </Link>
      )}
    </main>
  );
}
