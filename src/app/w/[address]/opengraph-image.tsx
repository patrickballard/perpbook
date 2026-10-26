import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { HyperliquidClient, isAddress } from "@/lib/hyperliquid/client";
import { moneyHeadline, shortAddress } from "@/lib/format";
import { compactUsd, demoShareStats, shareStats, sparkline, type ShareStats } from "@/lib/share";

export const alt = "perpbook trading journal: all-time PnL for this wallet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Cards get fetched by every app a link is pasted into; one portfolio request per wallet per 15 minutes.
export const revalidate = 900;

// The dark theme from globals.css, which reads best in social feeds.
const C = { page: "#0d0d0d", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", line: "#2c2c2a", accent: "#3987e5", up: "#3fc794", down: "#f07f7f" };

const FONTS = [
  ["Geist", "geist-sans/Geist-Regular.ttf", 400],
  ["Geist", "geist-sans/Geist-SemiBold.ttf", 600],
  ["GeistMono", "geist-mono/GeistMono-Medium.ttf", 500],
] as const;

async function fonts() {
  try {
    return await Promise.all(
      FONTS.map(async ([name, file, weight]) => ({
        name,
        weight,
        style: "normal" as const,
        data: await readFile(join(process.cwd(), "node_modules/geist/dist/fonts", file)),
      })),
    );
  } catch {
    return undefined; // fall back to the default font rather than failing the card
  }
}

/** Where the card says to go: the configured site, Vercel's production domain, or the repo. */
function siteHost(): string {
  const url = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  try {
    if (url) return new URL(url).host;
  } catch {}
  return "github.com/patrickballard/perpbook";
}

async function statsFor(address: string): Promise<ShareStats | null> {
  if (address === "demo") return demoShareStats();
  if (!isAddress(address)) return null;
  return shareStats(await new HyperliquidClient().portfolio(address.toLowerCase()).catch(() => null));
}

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const [stats, fontList] = await Promise.all([statsFor(address), fonts()]);
  const tone = (v: number) => (v > 0.004 ? C.up : v < -0.004 ? C.down : C.ink);
  const label = address === "demo" ? "Demo account" : isAddress(address) ? shortAddress(address) : "";

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.page, color: C.ink, padding: 64, fontFamily: "Geist" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 34 }}>
          <div style={{ display: "flex", fontWeight: 600 }}>
            perpbook<span style={{ color: C.accent }}>.</span>
          </div>
          <div style={{ display: "flex", fontFamily: "GeistMono", color: C.ink2, fontSize: 28 }}>{label}</div>
        </div>

        {stats ? (
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
            <div style={{ display: "flex", marginTop: 52, fontSize: 30, color: C.muted }}>All-time PnL on Hyperliquid perps, after fees and funding</div>
            <div style={{ display: "flex", fontFamily: "GeistMono", fontSize: 128, color: tone(stats.allTime), marginTop: 4, letterSpacing: -4, whiteSpace: "nowrap" }}>
              {moneyHeadline(stats.allTime)}
            </div>
            <div style={{ display: "flex", gap: 40, fontSize: 30, color: C.muted, marginTop: 4 }}>
              {stats.month != null && (
                <div style={{ display: "flex", gap: 12 }}>
                  30 days <span style={{ color: tone(stats.month), fontFamily: "GeistMono" }}>{moneyHeadline(stats.month)}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 12 }}>
                Volume <span style={{ color: C.ink, fontFamily: "GeistMono" }}>{compactUsd(stats.volume)}</span>
              </div>
            </div>
            <svg width="1072" height="110" viewBox="0 0 1072 110" style={{ marginTop: "auto" }}>
              <polyline points={sparkline(stats.series, 1072, 104)} fill="none" stroke={tone(stats.allTime)} strokeWidth="4" strokeLinejoin="round" transform="translate(0 3)" />
            </svg>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 600, letterSpacing: -2 }}>Every trade, rebuilt.</div>
            <div style={{ display: "flex", fontSize: 34, color: C.ink2, marginTop: 16 }}>Paste a Hyperliquid wallet. Real PnL after fees and funding.</div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.line}`, paddingTop: 24, marginTop: 28, fontSize: 24, color: C.muted }}>
          <div style={{ display: "flex" }}>Open-source trading journal · read-only, no keys</div>
          <div style={{ display: "flex" }}>{siteHost()}</div>
        </div>
      </div>
    ),
    { ...size, fonts: fontList },
  );
}
