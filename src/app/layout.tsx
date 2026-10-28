import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { VercelAnalytics } from "@/components/VercelAnalytics";
import { siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute URLs for share images and canonical links. Next works out images on Vercel by itself,
  // but leaves canonical links relative, so use the production address there too.
  metadataBase: siteUrl() ?? undefined,
  // Says "Hyperliquid": that's the word people (and AI search) put in front of "trading journal".
  title: "perpbook · free Hyperliquid trading journal and PnL tracker",
  description:
    "Free, open-source trading journal for Hyperliquid perps. Paste a wallet and get every trade rebuilt, your real PnL after fees and funding, and where your edge actually is.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        {children}
        {/* Only on Vercel: self-hosted copies send nothing and don't request a script that isn't there. */}
        {process.env.VERCEL === "1" && <VercelAnalytics />}
      </body>
    </html>
  );
}
