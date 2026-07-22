import { signIn } from "@/auth";

export default function SignInPage() {
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
          await signIn("google", { redirectTo: "/profile" });
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
