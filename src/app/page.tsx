import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events, profiles } from "@/db/schema";
import { computeLinkFitScore, computeStructuralScore } from "@/lib/scoring";

const CATEGORY_LABELS: Record<(typeof eventCategoryEnum)[number], string> = {
  founders: "Founders",
  engineers: "Engineers",
  vcs_investors: "VCs & Investors",
  operators: "Operators",
  ai: "AI",
  health_fitness: "Health & Fitness",
  robotics: "Robotics",
  hackathons: "Hackathons",
  marketing_gtm: "Marketing & GTM",
  design: "Design",
  networking: "Networking",
};

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

  const [allEvents, links] = await Promise.all([
    db.query.events.findMany({
      orderBy: [asc(events.date)],
      with: { host: { with: { profile: true } } },
    }),
    db.query.curatedLinks.findMany({ orderBy: [desc(curatedLinks.createdAt)] }),
  ]);

  const categoryCounts = eventCategoryEnum.map((category) => ({
    category,
    count:
      allEvents.filter((e) => e.category === category).length +
      links.filter((l) => l.category === category).length,
  }));

  const recommendations = isProfileComplete
    ? [
        ...allEvents.map((event) => ({
          kind: "event" as const,
          id: event.id,
          title: event.title,
          subtitle: `${event.date.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}${event.host?.profile?.fullName ? ` · hosted by ${event.host.profile.fullName}` : ""}`,
          description: event.description,
          image: null as string | null,
          href: `/events/${event.id}/apply`,
          external: false,
          score: computeStructuralScore(profile!, event.criteriaWeights),
        })),
        ...links.map((link) => ({
          kind: "link" as const,
          id: link.id,
          title: link.title || link.sourceUrl,
          subtitle: "From around town",
          description: link.description,
          image: link.imageUrl,
          href: link.sourceUrl,
          external: true,
          score: computeLinkFitScore(profile!, link),
        })),
      ].sort((a, b) => b.score - a.score)
    : [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Discover
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-8">
        Browse by category
      </h1>

      <div className="mb-14 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {categoryCounts.map(({ category, count }) => (
          <Link
            key={category}
            href={`/category/${category}`}
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent/40"
          >
            <p className="font-medium text-foreground">
              {CATEGORY_LABELS[category]}
            </p>
            <p className="font-mono text-xs text-foreground-soft">
              {count} {count === 1 ? "listing" : "listings"}
            </p>
          </Link>
        ))}
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Recommended for you
      </p>

      {!isProfileComplete ? (
        <div className="rounded-lg border border-accent/30 bg-accent-soft p-6 text-center">
          <p className="mb-4 text-sm text-foreground">
            Recommendations are scored against your profile — build yours
            first to see what&apos;s worth your time.
          </p>
          <Link
            href="/profile"
            className="inline-block rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
          >
            Build your profile
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-foreground-soft mb-6">
            Ranked by fit against your profile.
          </p>
          <div className="flex flex-col gap-3">
            {recommendations.map((item) => (
              <a
                key={`${item.kind}-${item.id}`}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className="flex items-start gap-4 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-accent/40"
              >
                {item.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.image}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent mb-1">
                    {item.subtitle}
                  </p>
                  <h2 className="font-serif text-lg font-semibold text-foreground">
                    {item.title}
                  </h2>
                  {item.description && (
                    <p className="mt-1 truncate text-sm text-foreground-soft">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-lg font-semibold tabular-nums">
                    {item.score}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-foreground-soft/70">
                    fit
                  </div>
                </div>
              </a>
            ))}
            {recommendations.length === 0 && (
              <p className="text-sm text-foreground-soft">
                Nothing to recommend yet.
              </p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
