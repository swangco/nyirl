import { asc, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events, profiles } from "@/db/schema";
import { EmptyState } from "@/components/empty-state";
import { FitScore, ReasonChip } from "@/components/fit-score";
import { ListingCard } from "@/components/listing-card";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { isPrefetchRequest, logImpressions } from "@/lib/interactions";
import { trackedHref } from "@/lib/links";
import { computeStructuralScore, describeFit, scoreCuratedLink } from "@/lib/scoring";

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
      <main className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
        <h1 className="font-geist text-4xl font-semibold uppercase tracking-[0.14em] text-foreground sm:text-5xl sm:tracking-[0.16em]">
          NY IRL
        </h1>
        <p className="max-w-sm font-serif text-xl text-foreground text-balance">
          Be in the right room. Curated to your profile.
        </p>
        <Link
          href="/sign-in"
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
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

  // Serena's own events are her track record, not third-party curation, so they
  // pin above scored links and don't carry a competitive fit number.
  const hostedItems = allEvents.map((event) => ({
    kind: "event" as const,
    id: event.id,
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

  const linkItems = isProfileComplete
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
            href: trackedHref({ id: link.id, kind: "link", source: "homepage" }),
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
        .sort((a, b) => b.score - a.score)
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
    <PageShell>
      <PageHeader eyebrow="Discover" title="Browse by category" />

      <div className="mb-14 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {categoryCounts.map(({ category, count }) => (
          <Link
            key={category}
            href={`/category/${category}`}
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent/40"
          >
            <p className="font-medium text-foreground">{CATEGORY_LABELS[category]}</p>
            <p className="font-mono text-xs text-foreground-soft">
              {count} {count === 1 ? "listing" : "listings"}
            </p>
          </Link>
        ))}
      </div>

      {techWeek.length > 0 && (
        <div className="mb-14">
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
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-accent">
        Recommended for you
      </p>

      {!isProfileComplete ? (
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
          </p>
          <div className="flex flex-col gap-3">
            {recommendations.map((item) => (
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
              />
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
