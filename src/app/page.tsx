import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, events, profiles } from "@/db/schema";
import { computeLinkFitScore, computeStructuralScore } from "@/lib/scoring";

export default async function Home() {
  const session = await auth();

  const profile = session?.user?.id
    ? await db.query.profiles.findFirst({
        where: eq(profiles.userId, session.user.id),
      })
    : null;

  const isProfileComplete =
    !!profile?.fullName &&
    (profile.profileType?.length ?? 0) > 0 &&
    !!profile.bioBlurb?.trim();

  // Signed out — a minimal landing, not the list.
  if (!session?.user?.id) {
    return (
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-6 py-32 text-center">
        <h1 className="font-geist text-4xl font-semibold uppercase tracking-[0.14em] text-foreground sm:text-5xl sm:tracking-[0.16em]">
          NY IRL
        </h1>
        <p className="max-w-sm font-serif text-xl text-foreground text-balance">
          Be in the right room. Curated to your profile.
        </p>
        <Link
          href="/sign-in"
          className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Sign in to discover events
        </Link>
      </main>
    );
  }

  // Signed in, profile incomplete — the gate.
  if (!isProfileComplete) {
    return (
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
          One step first
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-balance">
          Build your profile to unlock Discover
        </h1>
        <p className="max-w-sm text-foreground-soft">
          Recommendations are scored against your profile — a name, what
          you're building, and who you are matters more here than a form
          field. Fill in your profile type and a real bio to see what's
          worth your time.
        </p>
        <Link
          href="/profile"
          className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Build your profile
        </Link>
      </main>
    );
  }

  // Full profile — the actual Discover list.
  const [allEvents, links] = await Promise.all([
    db.query.events.findMany({
      orderBy: [asc(events.date)],
      with: { host: { with: { profile: true } } },
    }),
    db.query.curatedLinks.findMany({ orderBy: [desc(curatedLinks.createdAt)] }),
  ]);

  const eventsWithFit = allEvents.map((event) => ({
    event,
    fit: computeStructuralScore(profile, event.criteriaWeights),
  }));

  const linksWithFit = links
    .map((link) => ({ link, fit: computeLinkFitScore(profile, link) }))
    .sort((a, b) => b.fit - a.fit);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Discover
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-2">
        Recommended for you
      </h1>
      <p className="text-sm text-foreground-soft mb-8">
        Ranked by fit against your profile.
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
                  {event.host?.profile?.fullName && (
                    <> · hosted by {event.host.profile.fullName}</>
                  )}
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
              <div className="shrink-0 text-right">
                <div className="font-mono text-lg font-semibold tabular-nums">
                  {fit}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-foreground-soft/70">
                  fit
                </div>
              </div>
            </div>
          </Link>
        ))}
        {allEvents.length === 0 && (
          <p className="text-sm text-foreground-soft">No events listed yet.</p>
        )}
      </div>

      {links.length > 0 && (
        <div className="mt-14">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
            From around town
          </p>
          <p className="text-sm text-foreground-soft mb-6">
            Worth knowing about, hosted elsewhere — RSVP on the original
            platform.
          </p>
          <div className="flex flex-col gap-3">
            {linksWithFit.map(({ link, fit }) => (
              <a
                key={link.id}
                href={link.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent/40"
              >
                {link.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.imageUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {link.title || link.sourceUrl}
                  </p>
                  {link.description && (
                    <p className="mt-0.5 truncate text-sm text-foreground-soft">
                      {link.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-lg font-semibold tabular-nums">
                    {fit}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-foreground-soft/70">
                    fit
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
