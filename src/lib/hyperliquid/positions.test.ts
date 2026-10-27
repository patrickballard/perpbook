import { afterEach, describe, expect, it, vi } from "vitest";
import { HyperliquidClient, RATE_LIMITED, syncErrorMessage } from "./client";
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

  describe("the list of dexs", () => {
    afterEach(() => vi.useRealTimers());
    const counting = (fail = 0) => {
      const asked = { n: 0 };
      const fetchImpl = (async () => {
        asked.n++;
        return asked.n <= fail ? new Response("", { status: 400 }) : new Response(JSON.stringify([null, { name: "xyz" }]));
      }) as unknown as typeof fetch;
      return { asked, client: new HyperliquidClient(fetchImpl) };
    };

    it("is asked for once and reused for 10 minutes", async () => {
      vi.useFakeTimers();
      const { asked, client } = counting();
      await Promise.all([client.perpDexs(), client.perpDexs()]);
      vi.advanceTimersByTime(9 * 60_000);
      expect(await client.perpDexs()).toEqual(["", "xyz"]);
      expect(asked.n).toBe(1);
      vi.advanceTimersByTime(2 * 60_000);
      await client.perpDexs();
      expect(asked.n).toBe(2);
    });

    it("isn't kept when the request fails", async () => {
      const { asked, client } = counting(1);
      await expect(client.perpDexs()).rejects.toThrow();
      expect(await client.perpDexs()).toEqual(["", "xyz"]);
      expect(asked.n).toBe(2);
    });
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

describe("syncErrorMessage", () => {
  it("says what went wrong, and only blames the address when Hyperliquid rejected it", () => {
    expect(syncErrorMessage(new TypeError("Failed to fetch"))).toBe("Couldn't reach Hyperliquid. Check your connection and try again.");
    expect(syncErrorMessage(new TypeError("Load failed"))).toMatch(/connection/); // Safari
    expect(syncErrorMessage(new Error("Hyperliquid returned 502"))).toBe("Hyperliquid isn't responding right now (502). Try again in a minute.");
    expect(syncErrorMessage(new Error("Hyperliquid returned 422"))).toMatch(/Check the address/);
    expect(syncErrorMessage(new Error(RATE_LIMITED))).toBe(`${RATE_LIMITED}.`);
    expect(syncErrorMessage(new Error("Couldn't load saved history (500)"))).toBe("Couldn't load saved history (500).");
  });
});

