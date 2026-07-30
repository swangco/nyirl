import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/category");
  }

  const { category: categoryParam } = await params;
  if (!(eventCategoryEnum as readonly string[]).includes(categoryParam)) {
    notFound();
  }
  const category = categoryParam as (typeof eventCategoryEnum)[number];

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, session.user.id),
  });
  const isProfileComplete =
    !!profile?.fullName &&
    (profile.profileType?.length ?? 0) > 0 &&
    !!profile.bioBlurb?.trim();

  const now = new Date();

  const [categoryEvents, categoryLinks] = await Promise.all([
    db.query.events.findMany({
      where: (events, { and, eq, gte }) =>
        and(eq(events.category, category), gte(events.date, now)),
      orderBy: [asc(events.date)],
      with: { host: { with: { profile: true } } },
    }),
    db.query.curatedLinks.findMany({
      where: (curatedLinks, { and, eq, gte }) =>
        and(eq(curatedLinks.category, category), gte(curatedLinks.eventDate, now)),
      orderBy: [desc(curatedLinks.createdAt)],
    }),
  ]);

<<<<<<< HEAD
  // Events are always hosted by Serena in this app's current single-host
  // model, so they're pinned above scored links rather than competing on
  // the rubric — see the April–July curation audit for the reasoning.
  const hostedEvents: RecommendationItem[] = categoryEvents.map((event) => ({
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
    href: `/events/${event.id}/apply`,
    external: false,
=======
  const hostedItems = categoryEvents.map((event) => ({
    kind: "event" as const,
    id: event.id,
    href: `/events/${event.id}/apply`,
    external: false,
    image: null as string | null,
    eyebrow: `${event.date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
    })} · Hosted by NY IRL`,
    title: event.title,
    description: event.description,
    tier: null as string | null,
    reason: "",
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
    score:
      isProfileComplete && profile
        ? computeStructuralScore(profile, event.criteriaWeights, event.tags)
        : 0,
  }));

<<<<<<< HEAD
  const scoredLinks: RecommendationItem[] = categoryLinks
=======
  const linkItems = categoryLinks
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
    .map((link) => {
      // With no complete profile this ranks by pure quality (CQS) — the sensible
      // default order before we know anything about the viewer.
      const s = scoreCuratedLink(isProfileComplete ? profile : null, link, {
        profileEmbedding: profile?.embedding,
        linkEmbedding: link.embedding,
      });
      const { tier: fitTier, reason } = describeFit(link, s);
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
        href: trackedHref({ id: link.id, kind: "link", source: "category" }),
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
        external: true,
        image: link.imageUrl,
        eyebrow: "From around town",
        title: link.title || link.sourceUrl,
        description: link.description,
        tier: isProfileComplete ? fitTier : "Curated",
        reason,
        score: s.score,
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const items = [...hostedItems, ...linkItems];

  if (items.length > 0 && !(await isPrefetchRequest())) {
    const userId = session?.user?.id ?? null;
    after(() =>
      logImpressions(
        items.map((it) => ({ kind: it.kind, id: it.id, score: it.score })),
        { userId, source: "category" },
      ),
    );
  }

  return (
<<<<<<< HEAD
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="mb-4 inline-block font-mono text-xs uppercase tracking-[0.14em] text-foreground-soft transition-colors hover:text-foreground"
      >
        ← All categories
      </Link>
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-balance">
        {CATEGORY_LABELS[category]}
      </h1>

      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <RecommendationCard
            key={`${item.kind}-${item.id}`}
            item={item}
            scoreLabel={isProfileComplete ? "fit" : "quality"}
          />
        ))}
        {items.length === 0 && (
          <p className="text-sm text-foreground-soft">
            Nothing in this category yet.
          </p>
        )}
      </div>
    </main>
=======
    <PageShell>
      <PageHeader
        title={CATEGORY_LABELS[category]}
        back={
          <Link
            href="/"
            className="mb-3 inline-block font-mono text-xs uppercase tracking-[0.14em] text-accent hover:text-accent-hover"
          >
            ← All categories
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          eyebrow="Nothing upcoming"
          title="No upcoming events in this category yet."
          action={{ href: "/", label: "Back to Discover" }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
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
      )}
    </PageShell>
>>>>>>> 0f343c72596871eb166f3827b71c6fe36cac7df5
  );
}
