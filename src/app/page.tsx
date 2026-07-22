import Link from "next/link";

const FEATURED_EVENT_ID = "35353cfe-17e5-495b-92cd-ca56f597db37";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
        Curated events, curated the right way
      </p>
      <h1 className="font-serif text-5xl font-semibold tracking-tight text-balance">
        NY IRL
      </h1>
      <p className="max-w-md text-foreground-soft">
        One profile, reused for every event you apply to. Hosts see who&apos;s
        actually the right fit — not just who registered first.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/events/${FEATURED_EVENT_ID}/apply`}
          className="rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Apply to Founder Mahjong Night
        </Link>
        <Link
          href="/profile"
          className="rounded-md border border-line bg-surface px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-line/40"
        >
          Your profile
        </Link>
      </div>
    </main>
  );
}
