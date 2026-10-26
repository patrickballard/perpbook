import { describe, expect, it } from "vitest";
import { HyperliquidClient } from "./client";
import { allTimePerpPnl, normalisePositions, perpHistoryStart } from "./normalise";

describe("positions across dexs", () => {
  it("asks every perp dex, including HIP-3 ones, and merges positions", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      bodies.push(b);
      if (b.type === "perpDexs") return new Response(JSON.stringify([null, { name: "xyz" }]));
      const coin = b.dex ? "xyz:GOLD" : "BTC";
      return new Response(
        JSON.stringify({ marginSummary: { accountValue: "100" }, assetPositions: [{ position: { coin, szi: "1", entryPx: "1", positionValue: "1", unrealizedPnl: "-5", liquidationPx: null } }] }),
      );
    }) as typeof fetch;
    const chs = await new HyperliquidClient(fetchImpl).allClearinghouses("0xabc");
    const { positions, accountValue } = normalisePositions(chs);
    expect(positions.map((p) => p.coin)).toEqual(["BTC", "xyz:GOLD"]);
    expect(accountValue).toBe(200);
    expect(bodies.filter((b) => b.type === "clearinghouseState").map((b) => b.dex ?? "")).toEqual(["", "xyz"]);
  });

  it("reads Hyperliquid's all-time perps PnL from the portfolio", () => {
    expect(
      allTimePerpPnl([
        ["allTime", { pnlHistory: [[1, "9"]], accountValueHistory: [], vlm: "0" }],
        ["perpAllTime", { pnlHistory: [[1, "0"], [2, "568.27"]], accountValueHistory: [], vlm: "0" }],
      ]),
    ).toBe(568.27);
    expect(allTimePerpPnl(null)).toBeNull();
  });
});

describe("perpHistoryStart", () => {
  it("reads when Hyperliquid's perps PnL record starts", () => {
    expect(perpHistoryStart([["perpAllTime", { pnlHistory: [[1_741_000_000_000, "0"], [2, "5"]], accountValueHistory: [], vlm: "0" }]])).toBe(1_741_000_000_000);
    expect(perpHistoryStart(null)).toBeNull();
  });
});
