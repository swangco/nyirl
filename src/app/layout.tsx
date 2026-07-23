import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lora, Manrope } from "next/font/google";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

const HOST_USER_ID = "6a741461-1a2a-4313-b428-2bcf680d5f14"; // Serena Wang

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "NY IRL",
  description: "Curated events, curated the right way.",
};

export const viewport: Viewport = {
  themeColor: "#f9f7f1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const navLink =
  "inline-flex items-center py-1 text-sm text-foreground-soft transition-colors hover:text-foreground";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const signedIn = !!session?.user?.id;
  const isHost = session?.user?.id === HOST_USER_ID;

  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} ${lora.variable} ${geist.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <Link
              href="/"
              className="font-geist text-sm font-semibold uppercase tracking-[0.22em] text-foreground"
            >
              NY IRL
            </Link>
            <nav className="flex items-center gap-4 sm:gap-5">
              {signedIn ? (
                <>
                  <Link href="/" className={navLink}>
                    Discover
                  </Link>
                  <Link href="/applications" className={navLink}>
                    Applied
                  </Link>
                  <Link href="/profile" className={navLink}>
                    Profile
                  </Link>
                  {isHost && (
                    <Link href="/curate" className={navLink}>
                      Host
                    </Link>
                  )}
                </>
              ) : (
                <Link href="/sign-in" className={navLink}>
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
