import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { curatedLinks, eventCategoryEnum } from "@/db/schema";
import {
  addCuratedLink,
  addCuratedLinksBulk,
  removeCuratedLink,
} from "@/lib/actions/curated-links";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

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

export default async function CuratePage({
  searchParams,
}: {
  searchParams: Promise<{
    added?: string;
    removed?: string;
    bulkAdded?: string;
    bulkEmpty?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in?next=/curate");
  }
  if (session.user.id !== HOST_USER_ID) {
    return (
      <main className="mx-auto max-w-xl px-6 py-12">
        <p className="text-foreground-soft">This tool is host-only.</p>
      </main>
    );
  }

  const { added, removed, bulkAdded, bulkEmpty } = await searchParams;

  const links = await db.query.curatedLinks.findMany({
    orderBy: [desc(curatedLinks.createdAt)],
  });

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-3">
        Host tool
      </p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight mb-2">
        Curate a link
      </h1>
      <p className="text-sm text-foreground-soft mb-8">
        Paste a link to any event you&apos;re already reviewing — Partiful,
        Luma, wherever. Pulls the title, description, and image from that
        page so you don&apos;t have to retype it.
      </p>

      {added && (
        <div className="mb-6 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-foreground">
          Link added.
        </div>
      )}
      {removed && (
        <div className="mb-6 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-foreground">
          Link removed.
        </div>
      )}
      {bulkAdded && (
        <div className="mb-6 rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-foreground">
          Added {bulkAdded} link{bulkAdded === "1" ? "" : "s"} from your text.
        </div>
      )}
      {bulkEmpty && (
        <div className="mb-6 rounded-md border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm text-foreground">
          Couldn&apos;t find any event links in that text.
        </div>
      )}

      <form action={addCuratedLink} className="mb-6 flex gap-2">
        <input
          name="url"
          type="url"
          required
          placeholder="https://partiful.com/e/..."
          className="flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-soft/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          name="category"
          required
          defaultValue={eventCategoryEnum[0]}
          className="rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {eventCategoryEnum.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="shrink-0 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Add
        </button>
      </form>

      <details className="mb-10 rounded-lg border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Paste a whole post instead (e.g. from X)
        </summary>
        <p className="mt-2 mb-3 text-sm text-foreground-soft">
          Drop in the text of a post or thread listing multiple events — it
          pulls out every event link and adds them all at once.
        </p>
        <form action={addCuratedLinksBulk} className="flex flex-col gap-3">
          <textarea
            name="text"
            required
            rows={6}
            placeholder="Paste your X post or thread text here..."
            className="rounded-md border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-soft/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
          >
            Extract and add events
          </button>
        </form>
      </details>

      <div className="flex flex-col gap-3">
        {links.map((link) => (
          <div
            key={link.id}
            className="flex gap-4 rounded-lg border border-line bg-surface p-4"
          >
            {link.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={link.imageUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <a
                href={link.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:text-accent"
              >
                {link.title || link.sourceUrl}
              </a>
              {link.description && (
                <p className="mt-0.5 truncate text-sm text-foreground-soft">
                  {link.description}
                </p>
              )}
            </div>
            <form action={removeCuratedLink.bind(null, link.id)}>
              <button className="shrink-0 rounded-full border border-line bg-background px-3 py-1.5 text-xs font-medium text-foreground-soft hover:bg-line/40">
                Remove
              </button>
            </form>
          </div>
        ))}
        {links.length === 0 && (
          <p className="text-sm text-foreground-soft">
            No links curated yet.
          </p>
        )}
      </div>
    </main>
  );
}
