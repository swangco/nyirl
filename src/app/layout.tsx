import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lora, Manrope } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

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

const lora = Lora({ variable: "--font-lora", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "NY IRL — Curated NYC tech events",
  description:
    "A personal concierge for NYC tech events. Build a profile once, and see what's actually worth your time — scored to your fit.",
};

export const viewport: Viewport = {
  themeColor: "#F6F5F3",
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
      className={`${manrope.variable} ${geistMono.variable} ${geist.variable} ${lora.variable} bg-background h-full antialiased`}
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
                <Link href="/sign-in" className={navLinkClass}>
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
      </body>
    </html>
  );
}
