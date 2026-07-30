import { asc, desc, eq, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events, profiles } from "@/db/schema";
import { CategoryRail } from "@/components/category-rail";
import { DiscoverRow } from "@/components/discover-row";
import { EmptyState } from "@/components/empty-state";
import { FitScore, ReasonChip } from "@/components/fit-score";
import { PageShell } from "@/components/page-shell";
import { isPrefetchRequest, logImpressions } from "@/lib/interactions";
import { trackedHref } from "@/lib/links";
import { isProfileComplete as checkProfileComplete } from "@/lib/profile-completeness";
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

const eventDateLong = (d: Date) =>
  d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

const eventDateEyebrow = (d: Date) =>
  d
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    })
    .toUpperCase();

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/discover");
  }

  const { category: categoryParam } = await searchParams;
  const activeCategory =
    categoryParam && (eventCategoryEnum as readonly string[]).includes(categoryParam)
      ? (categoryParam as (typeof eventCategoryEnum)[number])
      : undefined;

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });
  const isProfileComplete = checkProfileComplete(profile);

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

  // Rail counts and "This week" always reflect the full upcoming inventory —
  // only the ranked list below is scoped to the active category. The rail
  // filters; it does not re-sort or re-score. Every category in the taxonomy
  // is shown, including zero-count ones (§A5) — the rail advertises what the
  // site covers, not only what's currently booked.
  const categoryCounts = eventCategoryEnum
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      count:
        allEvents.filter((e) => e.category === category).length +
        links.filter((l) => l.category === category).length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const allCount = allEvents.length + links.length;

  const scopedEvents = activeCategory
    ? allEvents.filter((e) => e.category === activeCategory)
    : allEvents;
  const scopedLinks = activeCategory
    ? links.filter((l) => l.category === activeCategory)
    : links;

  // Serena's own events are her track record, not third-party curation, so they
  // pin above scored links, but every row still shows a score (§A5) — reuse
  // describeFit's tier bands on the same structural score this page already
  // computes, rather than inventing a second scoring path. exclusivity/format
  // aren't event concepts, so pass the schema defaults ("capped"/"mixer");
  // describeFit's tier is score-only and doesn't read those two fields.
  const hostedItems = scopedEvents.map((event) => {
    const score = isProfileComplete
      ? computeStructuralScore(profile!, event.criteriaWeights, event.tags)
      : 0;
    const { tier } = describeFit(
      {
        title: event.title,
        description: event.description,
        exclusivity: "capped",
        format: "mixer",
        outOfTown: false,
        tags: event.tags,
      },
      { score, relevance: 0, quality: 0, boosts: 0, usedEmbedding: false },
    );
    return {
      kind: "event" as const,
      id: event.id,
      href: `/events/${event.id}/apply`,
      external: false,
      image: null as string | null,
      eyebrow: `${eventDateEyebrow(event.date)} · HOSTED BY NY IRL`,
      title: event.title,
      description: event.description,
      tier: tier as string | null,
      reason: "",
      score,
    };
  });

  const linkItems = isProfileComplete
    ? scopedLinks
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
            eyebrow: link.eventDate
              ? `${eventDateEyebrow(link.eventDate)} · AROUND TOWN`
              : "AROUND TOWN",
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
  // source stays the literal "homepage" string — this is the same interaction
  // stream as before the route rename, not a new source.
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
      .map((e) => ({
        id: e.id,
        title: e.title,
        date: eventDateLong(e.date),
        href: `/events/${e.id}/apply`,
        external: false,
      })),
    ...links
      .filter((l) => l.tags?.includes("tech_week_cluster"))
      .map((l) => ({
        id: l.id,
        title: l.title || l.sourceUrl,
        date: l.eventDate ? eventDateLong(l.eventDate) : "",
        href: trackedHref({ id: l.id, kind: "link", source: "homepage" }),
        external: true,
      })),
  ];

  const railAll = {
    href: "/discover",
    label: "All",
    count: allCount,
    active: !activeCategory,
  };
  const railItems = categoryCounts.map(({ category, label, count }) => ({
    href: `/discover?category=${category}`,
    label,
    count,
    active: activeCategory === category,
  }));

  return (
    <PageShell width="discover">
      <div className="flex flex-col gap-8 lg:flex-row">
        <CategoryRail all={railAll} items={railItems} />

        <div className="min-w-0 flex-1">
          {techWeek.length > 0 && (
            <div className="mb-8">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                This week
              </p>
              <p className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm text-foreground">
                {techWeek.map((item, i) => (
                  <span key={item.id} className="inline-flex items-center gap-1.5">
                    <a
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      className="underline decoration-line underline-offset-2 transition-colors hover:text-accent"
                    >
                      {item.title}
                    </a>
                    {i < techWeek.length - 1 && (
                      <span className="text-foreground-faint">·</span>
                    )}
                  </span>
                ))}
              </p>
            </div>
          )}

          <div className="mb-6">
            <h1 className="font-serif text-lg font-semibold text-foreground">
              Recommended for you
            </h1>
            <p className="mt-1 font-sans text-[13px] text-foreground-soft">
              {activeCategory
                ? `Ranked against your profile, in ${CATEGORY_LABELS[activeCategory]}.`
                : "Ranked against your profile."}
            </p>
          </div>

          {!isProfileComplete ? (
            <EmptyState
              title="Recommendations are scored against your profile — build yours first to see what's worth your time."
              action={{ href: "/profile", label: "Build your profile" }}
            />
          ) : recommendations.length === 0 ? (
            <EmptyState
              eyebrow="Nothing upcoming"
              title={
                activeCategory
                  ? "No upcoming events in this category yet."
                  : "No events match right now. New rooms get curated every week — check back soon."
              }
              action={activeCategory ? { href: "/discover", label: "Clear filter" } : undefined}
            />
          ) : (
            <div className="divide-y divide-line">
              {recommendations.map((item) => (
                <DiscoverRow
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
                  score={
                    item.tier ? <FitScore score={item.score} tier={item.tier} /> : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
