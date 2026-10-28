import { describe, expect, it } from "vitest";
import type { HlFill, HlPortfolio } from "../hyperliquid/types";
import { fillStats, rank, weekResult, type Standing } from "./standings";

const H = 3_600_000;
const MON = Date.UTC(2026, 10, 2);
const SUN = MON + 6 * 24 * H + 20 * H;

/** A weekly portfolio with points every 6 hours from `from`: account value and cumulative PnL by time. */
function portfolio(from: number, value: (t: number) => number, pnl: (t: number) => number): HlPortfolio {
  const ts = Array.from({ length: 30 }, (_, i) => from + i * 6 * H);
  return [["perpWeek", { accountValueHistory: ts.map((t) => [t, String(value(t))]), pnlHistory: ts.map((t) => [t, String(pnl(t))]), vlm: "0" }]];
}

describe("weekResult", () => {
  it("is the week's PnL as a share of the starting account", () => {
    const p = portfolio(MON - 12 * H, () => 1_000, (t) => (t >= MON + 24 * H ? 150 : 50));
    expect(weekResult(p, MON, SUN, SUN)).toEqual({ pnl: 100, base: 1_000, ret: 0.1 });
  });

  it("doesn't count a mid-week deposit into an empty account as a huge return", () => {
    const p = portfolio(MON - 12 * H, (t) => (t >= MON + 72 * H ? 10_000 : 0), (t) => (t >= MON + 96 * H ? 500 : 0));
    const r = weekResult(p, MON, SUN, SUN)!;
    expect(r.ret).toBeGreaterThan(0.05);
    expect(r.ret).toBeLessThan(0.2); // 500 on ~5,000 average, not 500 on 0
  });

  it("starts a wallet that didn't exist on Monday from nothing", () => {
    const p = portfolio(MON + 30 * H, () => 2_000, (t) => (t > MON + 60 * H ? -200 : 0));
    expect(weekResult(p, MON, SUN, SUN)?.pnl).toBe(-200);
  });

  it("leaves accounts under $100 unranked, and wallets with no perps out", () => {
    expect(weekResult(portfolio(MON - H, () => 50, () => 5), MON, SUN, SUN)?.ret).toBeNull();
    expect(weekResult([["perpWeek", { accountValueHistory: [], pnlHistory: [], vlm: "0" }]], MON, SUN, SUN)).toBeNull();
  });
});

const fill = (startPosition: number, side: "B" | "A", sz: number, extra: Partial<HlFill> = {}): HlFill => ({
  coin: "BTC", px: "1", sz: String(sz), side, time: MON, startPosition: String(startPosition), dir: "", closedPnl: "0", hash: "0x", oid: 0, crossed: true, fee: "0", tid: 0, ...extra,
});

describe("fillStats", () => {
  it("counts trades closed (back to zero or flipped), not closing fills, and spots liquidations of this wallet", () => {
    const me = "0xabc";
    const fills = [
      fill(0, "B", 2), fill(2, "A", 1), fill(1, "A", 1), // one trade, closed in two fills
      fill(0, "A", 1), fill(-1, "B", 3), // a short flipped to long: one more closed
      fill(2, "A", 2, { liquidation: { liquidatedUser: "0xABC", markPx: "1", method: "market" } }),
      fill(5, "A", 5, { coin: "@107" }), // spot: ignored
      fill(1, "A", 1, { liquidation: { liquidatedUser: "0xdef", markPx: "1", method: "market" } }), // someone else's
    ];
    expect(fillStats(fills, me)).toEqual({ closed: 4, liquidated: true });
  });
});

describe("rank", () => {
  const s = (handle: string, ret: number | null, pnl: number, closed: number | null): Standing => ({ handle, address: handle, pnl, base: 1, ret, closed, liquidated: false });
  it("ranks by return, counts holders, and sets aside who didn't play", () => {
    const { ranked, sittingOut } = rank([s("@a", 0.05, 50, 3), s("@b", 0.4, 400, 0), s("@c", null, 5, 2), s("@d", 0, 0, 0), s("@e", -0.2, -20, null)]);
    expect(ranked.map((x) => x.handle)).toEqual(["@b", "@a", "@e"]);
    expect(sittingOut.map((x) => x.handle)).toEqual(["@c", "@d"]);
  });
});
