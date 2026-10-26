import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { isAddress } from "@/lib/hyperliquid/client";

type Props = { params: Promise<{ address: string }> };

// The page is the same for every visitor (the dashboard loads in the browser), so build each
// address's page on its first visit and serve that copy from Vercel's cache after.
export const generateStaticParams = async () => [];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const title = address === "demo" ? "Demo journal · perpbook" : `${address.slice(0, 6)}…${address.slice(-4)} · perpbook`;
  const description = "Every trade rebuilt from Hyperliquid, with real PnL after fees and funding.";
  // The image itself comes from opengraph-image.tsx next to this page.
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default async function WalletPage({ params }: Props) {
  const { address } = await params;
  if (address !== "demo" && !isAddress(address)) notFound();
  return <Dashboard address={address === "demo" ? "demo" : address.toLowerCase()} />;
}
