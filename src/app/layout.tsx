import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute URLs for share images; Vercel deployments work it out without this.
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  title: "perpbook · open-source trading journal for perps",
  description:
    "Paste a Hyperliquid wallet and get every trade rebuilt, your real PnL after fees and funding, and where your edge actually is.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>{children}</body>
    </html>
  );
}
