import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "NY IRL — Curated NYC tech events",
  description:
    "A personal concierge for NYC tech events. Build a profile once, and see what's actually worth your time — scored to your fit.",
};

export const viewport: Viewport = {
  themeColor: "#f9f7f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

const navLinkClass =
  "rounded-md px-3 py-1.5 font-medium text-foreground-soft transition-colors hover:bg-accent-soft hover:text-foreground";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const signedIn = !!session?.user?.id;
  const isHost = session?.user?.id === HOST_USER_ID;

  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${geist.variable} bg-background h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-50 border-b border-line bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="text-sm font-bold uppercase tracking-[0.2em] text-foreground"
            >
              NY IRL
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {signedIn ? (
                <>
                  <Link href="/" className={navLinkClass}>
                    Discover
                  </Link>
                  <Link href="/applications" className={navLinkClass}>
                    Applied
                  </Link>
                  <Link href="/profile" className={navLinkClass}>
                    Profile
                  </Link>
                  {isHost && (
                    <Link href="/curate" className={navLinkClass}>
                      Host
                    </Link>
                  )}
                </>
              ) : (
                <Link href="/sign-in" className={navLinkClass}>
                  Sign in
                </Link>
              )}
            </nav>
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
      </body>
    </html>
  );
}
