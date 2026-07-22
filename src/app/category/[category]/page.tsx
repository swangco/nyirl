import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events, profiles } from "@/db/schema";
import { isPrefetchRequest, logImpressions } from "@/lib/interactions";
import { trackedHref } from "@/lib/links";
import { computeStructuralScore, scoreCuratedLink } from "@/lib/scoring";

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
    subtitle: `${event.date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "America/New_York",
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
    .map((link) => ({
      kind: "link" as const,
      id: link.id,
      title: link.title || link.sourceUrl,
      subtitle: "From around town",
      description: link.description,
      image: link.imageUrl,
      href: trackedHref({
        id: link.id,
        kind: "link",
        source: "category",
      }),
      external: true,
      // With no complete profile this ranks by pure quality (CQS) — the sensible
      // default order before we know anything about the viewer.
      score: scoreCuratedLink(isProfileComplete ? profile : null, link, {
        profileEmbedding: profile?.embedding,
        linkEmbedding: link.embedding,
      }).score,
    }))
    .sort((a, b) => b.score - a.score);

  const items = [...hostedEvents, ...scoredLinks];

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
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="mb-3 inline-block font-mono text-xs uppercase tracking-[0.14em] text-accent hover:text-accent-hover"
      >
        ← All categories
      </Link>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-8">
        {CATEGORY_LABELS[category]}
      </h1>

      <div className="flex flex-col gap-3">
        {items.map((item) => (
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
            {item.score !== null && (
              <div className="shrink-0 text-right">
                <div className="font-mono text-lg font-semibold tabular-nums">
                  {item.score}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-foreground-soft/70">
                  {isProfileComplete ? "fit" : "quality"}
                </div>
              </div>
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
