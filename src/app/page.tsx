import Link from "next/link";

// TODO(Serena): swap in your real Substack subdomain, e.g. "nyirl" for nyirl.substack.com
const SUBSTACK_HANDLE = "serenawang";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center gap-20 px-6 py-24">
      <div className="flex flex-col items-center gap-8 text-center">
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
            href="/events"
            className="rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
          >
            Discover events
          </Link>
          <Link
            href="/profile"
            className="rounded-md border border-line bg-surface px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-line/40"
          >
            Your profile
          </Link>
        </div>
      </div>

      <div className="w-full rounded-lg border border-line bg-surface p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent mb-2">
          Stay in the loop
        </p>
        <h2 className="font-serif text-xl font-semibold mb-1">
          The newsletter
        </h2>
        <p className="mb-4 text-sm text-foreground-soft">
          Notes on NYC&apos;s startup and VC scene, before the events do.
        </p>
        <a
          href={`https://${SUBSTACK_HANDLE}.substack.com/subscribe`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Subscribe on Substack
        </a>
      </div>
    </main>
  );
}
