import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth } from "@/auth";
import "./globals.css";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "NY IRL",
  description: "Curated events, curated the right way.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="font-serif text-lg font-semibold tracking-tight text-foreground"
            >
              NY IRL
            </Link>
            <nav className="flex items-center gap-5 text-sm text-foreground-soft">
              <Link href="/events" className="hover:text-foreground">
                Events
              </Link>
              <Link href="/profile" className="hover:text-foreground">
                Profile
              </Link>
              {isHost && (
                <Link href="/curate" className="hover:text-foreground">
                  Curate
                </Link>
              )}
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-sm text-foreground-soft">
              Notes on NYC&apos;s startup and VC scene, before the events do.
            </p>
            <a
              href="https://nyirl.beehiiv.com/?modal=signup"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-line bg-surface px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:text-accent"
            >
              Subscribe to the newsletter
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
