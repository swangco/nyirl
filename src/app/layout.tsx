import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lora, Manrope } from "next/font/google";
import "./globals.css";

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

// Header/nav/footer chrome lives in (app)/layout.tsx, not here — the landing
// at "/" sits outside that group and renders full-bleed with no chrome (§A4).
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} ${geist.variable} ${lora.variable} bg-background h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
