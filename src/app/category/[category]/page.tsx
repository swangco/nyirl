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
  const hostedEvents = categoryEvents.map((event) => ({
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
    score:
      isProfileComplete && profile
        ? computeStructuralScore(profile, event.criteriaWeights, event.tags)
        : null,
  }));

  const scoredLinks = categoryLinks
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
        subtitle: "From around town",
        description: link.description,
        image: link.imageUrl,
        href: link.sourceUrl,
        external: true,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

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
            {item.score !== null && (
              <ScoreBadge
                score={item.score}
                label={isProfileComplete ? "fit" : "quality"}
              />
            )}
          </a>
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
