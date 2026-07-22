import { signIn } from "@/auth";

/** Only allow a same-origin relative path (single leading "/"), so ?next= can't
 * bounce a user to an external site after login. A repeated ?next= param arrives
 * as an array, so coerce to the first value before validating. */
function safeNext(next: string | string[] | undefined): string {
  const raw = Array.isArray(next) ? next[0] : next;
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/profile";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const redirectTo = safeNext(next);
  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
          By invitation, by fit
        </p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-balance">
          Sign in to NY IRL
        </h1>
        <p className="max-w-sm text-sm text-foreground-soft">
          One profile, reused for every curated event you apply to.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo });
        }}
      >
        <button
          type="submit"
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
