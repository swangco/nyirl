import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lora, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["500", "600"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "NY IRL",
  description: "Curated events, curated the right way.",
};

export const viewport: Viewport = {
  themeColor: "#F6F5F3",
  width: "device-width",
  initialScale: 1,
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
      suppressHydrationWarning
      className={`${manrope.variable} ${geistMono.variable} ${lora.variable} ${geist.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
