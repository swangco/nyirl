import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth } from "@/auth";
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

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#fafafa",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
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
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 font-medium text-foreground-soft transition-colors hover:bg-accent-soft hover:text-foreground"
              >
                Discover
              </Link>
              <Link
                href="/profile"
                className="rounded-md px-3 py-1.5 font-medium text-foreground-soft transition-colors hover:bg-accent-soft hover:text-foreground"
              >
                Profile
              </Link>
              {isHost && (
                <Link
                  href="/curate"
                  className="rounded-md px-3 py-1.5 font-medium text-foreground-soft transition-colors hover:bg-accent-soft hover:text-foreground"
                >
                  Host
                </Link>
              )}
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
