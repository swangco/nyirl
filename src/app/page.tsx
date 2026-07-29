import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// Signed-out placeholder — the real gradient landing (§A4) is a later step.
// Signed-in visitors are sent straight to the ranked feed; there's nothing
// left for them to do at "/" now that its content lives at /discover.
export default async function Home() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/discover");
  }

  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-6 py-24 text-center">
      <h1 className="font-geist text-4xl font-semibold uppercase tracking-[0.14em] text-foreground sm:text-5xl sm:tracking-[0.16em]">
        NY IRL
      </h1>
      <p className="max-w-sm font-serif text-xl text-foreground text-balance">
        Be in the right room. Curated to your profile.
      </p>
      <Link
        href="/sign-in"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
      >
        Sign in to discover events
      </Link>
    </main>
  );
}
