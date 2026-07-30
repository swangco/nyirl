import { asc, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events, profiles } from "@/db/schema";
<<<<<<< HEAD
import {
  computeBlendedLinkScore,
  computeCurationQualityScore,
  computeLinkFitScore,
  computeStructuralScore,
} from "@/lib/scoring";
import {
  RecommendationCard,
  type RecommendationItem,
} from "@/components/recommendation-card";
=======
import { EmptyState } from "@/components/empty-state";
import { FitScore, ReasonChip } from "@/components/fit-score";
import { ListingCard } from "@/components/listing-card";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { isPrefetchRequest, logImpressions } from "@/lib/interactions";
import { trackedHref } from "@/lib/links";
import { computeStructuralScore, describeFit, scoreCuratedLink } from "@/lib/scoring";
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5

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

const eventDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

export default async function Home() {
  const session = await auth();

  const profile = session?.user?.id
    ? await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) })
    : null;

  const isProfileComplete =
    !!profile?.fullName &&
    (profile.profileType?.length ?? 0) > 0 &&
    !!profile.bioBlurb?.trim();

  // Signed out — a minimal editorial landing, not the list.
  if (!session?.user?.id) {
    return (
<<<<<<< HEAD
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-28 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-foreground-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
          NYC tech events
        </span>
        <h1 className="max-w-xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Find an event worth your time
=======
      <main className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
        <h1 className="font-geist text-4xl font-semibold uppercase tracking-[0.14em] text-foreground sm:text-5xl sm:tracking-[0.16em]">
          NY IRL
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
        </h1>
        <Link
          href="/sign-in"
<<<<<<< HEAD
          className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-surface transition-colors hover:bg-accent-hover"
=======
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
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

<<<<<<< HEAD
  // Events are always hosted by Serena in this app's current single-host
  // model — they're her own track record, not third-party curation, so
  // they're pinned above scored links rather than competing on the rubric.
  const hostedEvents: RecommendationItem[] = allEvents.map((event) => ({
    kind: "event",
    id: event.id,
    title: event.title,
    meta: event.date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }),
    description: event.description,
    image: null,
=======
  // Serena's own events are her track record, not third-party curation, so they
  // pin above scored links and don't carry a competitive fit number.
  const hostedItems = allEvents.map((event) => ({
    kind: "event" as const,
    id: event.id,
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
    href: `/events/${event.id}/apply`,
    external: false,
    image: null as string | null,
    eyebrow: `${eventDate(event.date)} · Hosted by NY IRL`,
    title: event.title,
    description: event.description,
    tier: null as string | null,
    reason: "",
    score: isProfileComplete
      ? computeStructuralScore(profile!, event.criteriaWeights, event.tags)
      : 0,
  }));

<<<<<<< HEAD
  const scoredLinks: RecommendationItem[] = isProfileComplete
=======
  const linkItems = isProfileComplete
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
    ? links
        .map((link) => {
          const s = scoreCuratedLink(profile!, link, {
            profileEmbedding: profile!.embedding,
            linkEmbedding: link.embedding,
          });
          const { tier, reason } = describeFit(link, s);
          return {
            kind: "link" as const,
            id: link.id,
<<<<<<< HEAD
            title: link.title || link.sourceUrl,
            meta: "From around town",
            description: link.description,
            image: link.imageUrl,
            href: link.sourceUrl,
=======
            href: trackedHref({ id: link.id, kind: "link", source: "homepage" }),
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
            external: true,
            image: link.imageUrl,
            eyebrow: "From around town",
            title: link.title || link.sourceUrl,
            description: link.description,
            tier,
            reason,
            score: s.score,
          };
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [];

  const recommendations = isProfileComplete ? [...hostedItems, ...linkItems] : [];

  // Stage 0: record what was surfaced, after the response is sent so it never
  // blocks render. Skip prefetches. Clicks are logged separately via /api/out.
  if (isProfileComplete && recommendations.length > 0 && !(await isPrefetchRequest())) {
    const userId = profile!.userId;
    after(() =>
      logImpressions(
        recommendations.map((r) => ({ kind: r.kind, id: r.id, score: r.score })),
        { userId, source: "homepage" },
      ),
    );
  }

  const techWeek = [
    ...allEvents
      .filter((e) => e.tags?.includes("tech_week_cluster"))
      .map((e) => ({ id: e.id, title: e.title, date: eventDate(e.date), href: `/events/${e.id}/apply`, external: false })),
    ...links
      .filter((l) => l.tags?.includes("tech_week_cluster"))
      .map((l) => ({
        id: l.id,
        title: l.title || l.sourceUrl,
        date: l.eventDate ? eventDate(l.eventDate) : "",
        href: trackedHref({ id: l.id, kind: "link", source: "homepage" }),
        external: true,
      })),
  ];

  return (
<<<<<<< HEAD
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-foreground-soft">
        Discover
      </p>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-balance">
        Browse by category
      </h1>
=======
    <PageShell>
      <PageHeader eyebrow="Discover" title="Browse by category" />
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5

      <div className="mb-14 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {categoryCounts.map(({ category, count }) => (
          <Link
            key={category}
            href={`/category/${category}`}
            className="group flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-foreground/25"
          >
<<<<<<< HEAD
            <p className="font-mono text-xs tabular-nums text-foreground-soft">
              {String(count).padStart(2, "0")}
            </p>
            <p className="font-semibold tracking-tight text-foreground">
              {CATEGORY_LABELS[category]}
=======
            <p className="font-medium text-foreground">{CATEGORY_LABELS[category]}</p>
            <p className="font-mono text-xs text-foreground-soft">
              {count} {count === 1 ? "listing" : "listings"}
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
            </p>
          </Link>
        ))}
      </div>

      {techWeek.length > 0 && (
        <div className="mb-14">
<<<<<<< HEAD
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
=======
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-accent">
            This week
          </p>
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6">
            {techWeek.map((item) => (
              <a
                key={item.id}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className="w-56 shrink-0 snap-start rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent/40"
              >
                {item.date && (
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-foreground-soft">
                    {item.date}
                  </p>
                )}
                <p className="line-clamp-2 font-medium text-foreground">{item.title}</p>
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
              </a>
            ))}
          </div>
        </div>
      )}

<<<<<<< HEAD
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-foreground-soft">
=======
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-accent">
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
        Recommended for you
      </p>

      {!isProfileComplete ? (
<<<<<<< HEAD
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
=======
        <EmptyState
          title="Recommendations are scored against your profile — build yours first to see what's worth your time."
          action={{ href: "/profile", label: "Build your profile" }}
        />
      ) : recommendations.length === 0 ? (
        <EmptyState
          eyebrow="Nothing upcoming"
          title="No events match right now. New rooms get curated every week — check back soon."
        />
      ) : (
        <>
          <p className="mb-6 text-sm text-foreground-soft">
            Your own events first, then everything else ranked by fit against your profile.
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
          </p>
          <div className="flex flex-col gap-2.5">
            {recommendations.map((item) => (
<<<<<<< HEAD
              <RecommendationCard
                key={`${item.kind}-${item.id}`}
                item={item}
                scoreLabel="fit"
=======
              <ListingCard
                key={`${item.kind}-${item.id}`}
                href={item.href}
                external={item.external}
                image={item.image}
                eyebrow={item.eyebrow}
                title={item.title}
                description={item.description}
                chip={
                  item.kind === "link" && item.reason ? (
                    <ReasonChip>{item.reason}</ReasonChip>
                  ) : undefined
                }
                aside={
                  item.kind === "link" && item.tier ? (
                    <FitScore score={item.score} tier={item.tier} />
                  ) : undefined
                }
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
              />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
