import { asc, desc } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum, events } from "@/db/schema";

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

  const [categoryEvents, categoryLinks] = await Promise.all([
    db.query.events.findMany({
      where: (events, { eq }) => eq(events.category, category),
      orderBy: [asc(events.date)],
      with: { host: { with: { profile: true } } },
    }),
    db.query.curatedLinks.findMany({
      where: (curatedLinks, { eq }) => eq(curatedLinks.category, category),
      orderBy: [desc(curatedLinks.createdAt)],
    }),
  ]);

  const items = [
    ...categoryEvents.map((event) => ({
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
    })),
    ...categoryLinks.map((link) => ({
      kind: "link" as const,
      id: link.id,
      title: link.title || link.sourceUrl,
      subtitle: "From around town",
      description: link.description,
      image: link.imageUrl,
      href: link.sourceUrl,
      external: true,
    })),
  ];

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
