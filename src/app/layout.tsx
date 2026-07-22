import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora, Manrope } from "next/font/google";
import Link from "next/link";
import { auth } from "@/auth";
import "./globals.css";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
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
      className={`${manrope.variable} ${geistMono.variable} ${lora.variable} ${geist.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-8 py-6">
            <Link
              href="/"
              className="font-geist text-sm font-semibold uppercase tracking-[0.22em] text-foreground"
            >
              NY IRL
            </Link>
            <nav className="flex items-center gap-6 text-sm text-foreground-soft">
              <Link href="/" className="hover:text-foreground">
                Discover
              </Link>
              <Link href="/profile" className="hover:text-foreground">
                Profile
              </Link>
              {isHost && (
                <Link href="/curate" className="hover:text-foreground">
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
