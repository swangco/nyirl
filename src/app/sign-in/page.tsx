import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center gap-8 px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-foreground-soft">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
          By invitation, by fit
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-balance">
          Sign in to NY IRL
        </h1>
        <p className="max-w-sm text-base leading-relaxed text-foreground-soft">
          One profile, reused for every curated event you apply to.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/profile" });
        }}
      >
        <button
          type="submit"
          className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-surface transition-colors hover:bg-accent-hover"
        >
          Continue with Google
        </button>
      </form>
    </main>
  );
}
