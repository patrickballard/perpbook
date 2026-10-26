import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Per request, so a SITE_URL set only at runtime (self-hosting) is still used.
export const dynamic = "force-dynamic";

// Only public pages that are the same for everyone. Saved wallets stay out: listing them would
// publish who uses perpbook.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];
  return [
    { url: new URL("/", base).toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/w/demo", base).toString(), changeFrequency: "daily", priority: 0.8 },
  ];
}
