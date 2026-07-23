import { asc, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events, profiles } from "@/db/schema";
import {
  computeBlendedLinkScore,
  computeCurationQualityScore,
  computeLinkFitScore,
  computeStructuralScore,
} from "@/lib/scoring";
import { ScoreBadge } from "@/components/score-badge";

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
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-28 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-foreground-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
          NYC tech events
        </span>
        <h1 className="max-w-xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Be in the right room.
        </h1>
        <p className="max-w-md text-balance text-lg leading-relaxed text-foreground-soft">
          A personal concierge for NYC tech events. Build a profile once — then
          see what&apos;s actually worth your time, scored to your fit.
        </p>
        <Link
          href="/sign-in"
          className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-surface transition-colors hover:bg-accent-hover"
        >
          Sign in to discover events
        </Link>
      </main>
    );
  }

  const now = new Date();

  const [allEvents, links] = await Promise.all([
    db.query.events.findMany({
      where: gte(events.date, now),
      orderBy: [asc(events.date)],
      with: { host: { with: { profile: true } } },
    }),
    db.query.curatedLinks.findMany({
      where: gte(curatedLinks.eventDate, now),
      orderBy: [desc(curatedLinks.createdAt)],
    }),
  ]);

  const categoryCounts = eventCategoryEnum.map((category) => ({
    category,
    count:
      allEvents.filter((e) => e.category === category).length +
      links.filter((l) => l.category === category).length,
  }));

  // Events are always hosted by Serena in this app's current single-host
  // model — they're her own track record, not third-party curation, so
  // they're pinned above scored links rather than competing on the rubric.
  const hostedEvents = allEvents.map((event) => ({
    kind: "event" as const,
    id: event.id,
    title: event.title,
    subtitle: `${event.date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })} · Hosted by NY IRL`,
    description: event.description,
    image: null as string | null,
    href: `/events/${event.id}/apply`,
    external: false,
    score: isProfileComplete ? computeStructuralScore(profile!, event.criteriaWeights, event.tags) : null,
  }));

  const scoredLinks = isProfileComplete
    ? links
        .map((link) => {
          const fit = computeLinkFitScore(profile!, link);
          const cqs = computeCurationQualityScore(link);
          return {
            kind: "link" as const,
            id: link.id,
            title: link.title || link.sourceUrl,
            subtitle: "From around town",
            description: link.description,
            image: link.imageUrl,
            href: link.sourceUrl,
            external: true,
            score: computeBlendedLinkScore(fit, cqs),
          };
        })
        .sort((a, b) => b.score - a.score)
    : [];

  const recommendations = isProfileComplete ? [...hostedEvents, ...scoredLinks] : [];

  const techWeekItems = [
    ...allEvents.filter((e) => e.tags?.includes("tech_week_cluster")),
    ...links.filter((l) => l.tags?.includes("tech_week_cluster")),
  ];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-foreground-soft">
        Discover
      </p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-balance">
        Browse by category
      </h1>

      <div className="mb-14 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {categoryCounts.map(({ category, count }) => (
          <Link
            key={category}
            href={`/category/${category}`}
            className="group flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-foreground/25"
          >
            <p className="font-mono text-xs tabular-nums text-foreground-soft">
              {String(count).padStart(2, "0")}
            </p>
            <p className="font-semibold tracking-tight text-foreground">
              {CATEGORY_LABELS[category]}
            </p>
          </Link>
        ))}
      </div>

      {techWeekItems.length > 0 && (
        <div className="mb-14">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-foreground-soft">
            This week
          </p>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {techWeekItems.map((item) => (
              <a
                key={item.id}
                href={"sourceUrl" in item ? item.sourceUrl : `/events/${item.id}/apply`}
                target={"sourceUrl" in item ? "_blank" : undefined}
                rel={"sourceUrl" in item ? "noopener noreferrer" : undefined}
                className="w-56 shrink-0 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-foreground/25"
              >
                <p className="truncate font-semibold tracking-tight text-foreground">
                  {"sourceUrl" in item ? item.title || item.sourceUrl : item.title}
                </p>
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-foreground-soft">
        Recommended for you
      </p>

      {!isProfileComplete ? (
        <div className="rounded-lg border border-line bg-surface p-6">
          <p className="mb-4 text-sm leading-relaxed text-foreground-soft">
            Recommendations are scored against your profile — build yours
            first to see what&apos;s worth your time.
          </p>
          <Link
            href="/profile"
            className="inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-accent-hover"
          >
            Build your profile
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-6 text-sm leading-relaxed text-foreground-soft">
            Your own events first, then everything else ranked by fit against
            your profile.
          </p>
          <div className="flex flex-col gap-2.5">
            {recommendations.map((item) => (
              <a
                key={`${item.kind}-${item.id}`}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-foreground/25"
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
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground-soft">
                    {item.subtitle}
                  </p>
                  <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
                    {item.title}
                  </h2>
                  {item.description && (
                    <p className="mt-0.5 truncate text-sm text-foreground-soft">
                      {item.description}
                    </p>
                  )}
                </div>
                {item.score !== null && <ScoreBadge score={item.score} label="fit" />}
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
