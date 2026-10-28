import { ImageResponse } from "next/og";
import { currentSeason } from "@/lib/league/seasons";
import { C, ogFonts, siteHost } from "@/lib/og";

export const alt = "perpbook league: a week of Hyperliquid perps, ranked by % return";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// No live numbers: the card is the invitation, the page is the table. So it's built once per deploy
// and costs Hyperliquid nothing however often the link is shared.
const season = currentSeason();
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.page, color: C.ink, padding: 64, fontFamily: "Geist" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 34 }}>
          <div style={{ display: "flex", fontWeight: 600 }}>
            perpbook<span style={{ color: C.accent }}>.</span>
          </div>
          <div style={{ display: "flex", color: C.ink2, fontSize: 28 }}>League · {season.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>Who traded best this week?</div>
          <div style={{ display: "flex", fontSize: 34, color: C.ink2, marginTop: 24 }}>Hyperliquid perps, ranked by % return after fees and funding.</div>
          <div style={{ display: "flex", fontSize: 34, color: C.up, marginTop: 10 }}>A $500 account can beat a whale.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.line}`, paddingTop: 24, fontSize: 26, color: C.muted }}>
          <div style={{ display: "flex", fontFamily: "GeistMono" }}>
            {day(season.start)} – {day(season.end)}
          </div>
          <div style={{ display: "flex" }}>{siteHost()}/league</div>
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
