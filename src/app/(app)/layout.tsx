import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SiteNav } from "@/components/site-nav";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const navLink =
  "inline-flex items-center py-1 text-sm text-foreground-soft transition-colors hover:text-foreground";

// The chrome (header nav, footer) for every route except the landing at "/",
// which is a full-bleed, chrome-free single screen (§A4) and lives outside
// this group so the root layout can leave it untouched.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const signedIn = !!session?.user?.id;
  const isHost = session?.user?.id === HOST_USER_ID;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Link
            href="/"
            className="font-geist text-sm font-semibold uppercase tracking-[0.22em] text-foreground"
          >
            NY IRL
          </Link>
          {signedIn ? (
            <SiteNav
              items={[
                { href: "/discover", label: "Discover" },
                { href: "/applied", label: "Applied" },
                { href: "/profile", label: "Profile" },
                ...(isHost ? [{ href: "/curate", label: "Host" }] : []),
              ]}
            />
          ) : (
            <nav className="flex items-center gap-4 sm:gap-5">
              <Link href="/sign-in" className={navLink}>
                Sign in
              </Link>
            </nav>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-6 text-xs text-foreground-soft sm:px-6">
          <span className="font-mono uppercase tracking-[0.12em]">NY IRL · New York</span>
          {signedIn && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button type="submit" className="py-1 hover:text-foreground">
                Sign out
              </button>
            </form>
          )}
        </div>
      </footer>
    </>
  );
}
