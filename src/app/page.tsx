import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-6 py-32 text-center">
      <h1 className="font-geist text-4xl font-semibold uppercase tracking-[0.14em] text-foreground sm:text-5xl sm:tracking-[0.16em]">
        NY IRL
      </h1>
      <p className="max-w-sm font-serif text-xl text-foreground text-balance">
        Discover the right rooms to be in. Curated to your profile.
      </p>
      <div className="flex flex-col gap-3 pt-4 sm:flex-row">
        <Link
          href="/events"
          className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Discover events
        </Link>
        <Link
          href="/profile"
          className="rounded-full border border-line bg-surface px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-line/40"
        >
          Your profile
        </Link>
      </div>
    </main>
  );
}
