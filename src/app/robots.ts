import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Per request, so a SITE_URL set only at runtime (self-hosting) is still used.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    ...(base ? { sitemap: new URL("/sitemap.xml", base).toString() } : {}),
  };
}
