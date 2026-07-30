import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "NY IRL — Be in the right room",
  description:
    "A curated guide to NYC tech events, personally ranked to your profile.",
};

// One screen, type and gradient only — no logo mark, no image assets (§A4,
// rev 3). Signed-in visitors are sent straight to the ranked feed; there's
// nothing left for them to do here now that the feed lives at /discover.
export default async function Home() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/discover");
  }

  return (
    <main
      className="flex min-h-svh flex-col items-center justify-between gap-10 px-6 py-12 text-center sm:py-16"
      style={{ backgroundImage: "linear-gradient(to bottom, #C85A28, #E39B8B)" }}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <h1
          className="font-geist font-semibold uppercase text-[#F6F5F3]"
          style={{ fontSize: "clamp(2.75rem, 16vw, 8rem)", letterSpacing: "0.22em" }}
        >
          NY IRL
        </h1>
        <p className="max-w-md text-balance font-serif text-lg text-[#F6F5F3] sm:text-xl">
          Be in the right room.
        </p>
        <div className="flex w-full max-w-xs flex-col items-center gap-4 sm:w-auto sm:max-w-none sm:flex-row">
          <Link
            href="/apply"
            className="w-full rounded-full bg-[#F6F5F3] px-8 py-3 text-sm font-medium text-[#1F1F1F] transition-colors hover:bg-white sm:w-auto"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="text-sm text-[#F6F5F3]/85 underline underline-offset-4 transition-colors hover:text-[#F6F5F3]"
          >
            Sign in
          </Link>
        </div>
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#F6F5F3]/70">
        NY IRL · New York
      </p>
    </main>
  );
}
