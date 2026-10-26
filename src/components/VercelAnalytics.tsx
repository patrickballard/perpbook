"use client";

// Vercel Web Analytics (cookieless page views), wired by hand: the @vercel/analytics package
// declares a SvelteKit peer that conflicts with Vitest's Vite. This follows the same protocol as
// that package's Next.js component: load Vercel's script with auto-tracking off, then report each
// client-side route change. Wallet pages are reported as /w/[address], so no address ever
// reaches the analytics.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    va?: (...params: unknown[]) => void;
    vaq?: unknown[][];
  }
}

const SCRIPT = "/_vercel/insights/script.js";

export const analyticsPath = (path: string) => (path.startsWith("/w/") && path !== "/w/demo" ? "/w/[address]" : path);

export function VercelAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.va) return;
    // Calls made before the script loads wait in a queue, which the script drains on load.
    window.va = (...params) => void (window.vaq ??= []).push(params);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.defer = true;
    script.dataset.sdkn = "perpbook";
    script.dataset.disableAutoTrack = "1";
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const path = analyticsPath(pathname);
    window.va?.("pageview", { route: path, path });
  }, [pathname]);

  return null;
}
