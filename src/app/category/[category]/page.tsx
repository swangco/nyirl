import { asc, desc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events, profiles } from "@/db/schema";
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
    score:
      isProfileComplete && profile
        ? computeStructuralScore(profile, event.criteriaWeights, event.tags)
        : null,
  }));

  const scoredLinks: RecommendationItem[] = categoryLinks
    .map((link) => {
      const cqs = computeCurationQualityScore(link);
      const score =
        isProfileComplete && profile
          ? computeBlendedLinkScore(computeLinkFitScore(profile, link), cqs)
          : cqs;
      return {
        kind: "link" as const,
        id: link.id,
        title: link.title || link.sourceUrl,
        meta: "From around town",
        description: link.description,
        image: link.imageUrl,
        href: link.sourceUrl,
        external: true,
        score,
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const items = [...hostedEvents, ...scoredLinks];

  return (
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
  );
}
