import { describe, expect, it } from "vitest";
import { cardData } from "./card";
import { tradeStats } from "./engine/stats";
import type { Trade } from "./engine/trades";

const D = (s: string) => new Date(`${s}T12:00:00`).getTime(); // local noon, so the date shown is s
let n = 0;
const trade = (openedAt: string, closedAt: string | null, netPnl: number): Trade => ({
  key: `t${++n}`,
  coin: "BTC",
  direction: "long",
  status: closedAt ? "closed" : "open",
  openedAt: D(openedAt),
  closedAt: closedAt ? D(closedAt) : null,
  entryAvg: 1,
  exitAvg: closedAt ? 1 : null,
  maxSize: 1,
  grossPnl: netPnl,
  fees: 0,
  funding: 0,
  netPnl,
  fillCount: 2,
  partialHistory: false,
});

describe("cardData", () => {
  it("summarises the dashboard's numbers for the card", () => {
    const trades = [trade("2025-12-30", "2026-01-02", 10), trade("2026-03-01", "2026-10-26", -23_393_886.68)];
    const d = cardData({ label: "0x5078…edb6", stats: { ...tradeStats(trades), winRate: 0.42, profitFactor: 0.87, trades: 1_234 }, trades, reconciliation: null, host: "perpbook.vercel.app" });
    expect(d.period).toBe("30 Dec 2025 – 26 Oct 2026");
    expect(d.stats).toEqual([
      { label: "Win rate", value: "42%" },
      { label: "Profit factor", value: "0.87" },
      { label: "Trades", value: "1,234" },
    ]);
    expect(d.series).toEqual([0, 10, -23_393_876.68]);
    expect(d.matches).toBe(false);
  });

  it("draws a line that ends at the headline, even with an open position paying funding", () => {
    // The open trade's funding is in daily account PnL but not in closed trades' net PnL.
    const trades = [trade("2026-08-12", "2026-08-13", 5), trade("2026-09-01", "2026-09-02", -2), { ...trade("2026-10-01", null, 0), funding: -40, netPnl: -40 }];
    const stats = tradeStats(trades);
    const d = cardData({ label: "x", stats, trades, reconciliation: null, host: "h" });
    expect(d.net).toBe(3);
    expect(d.series).toEqual([0, 5, 3]);
    expect(d.series.at(-1)).toBe(d.net);
  });

  it("leaves out the year on the start date when the period is within one year", () => {
    const trades = [trade("2026-08-12", "2026-10-26", 1)];
    expect(cardData({ label: "x", stats: tradeStats(trades), trades, reconciliation: null, host: "h" }).period).toBe("12 Aug – 26 Oct 2026");
  });

  it("has no period and a flat line before any trade has closed", () => {
    const trades = [trade("2026-10-01", null, 0)];
    const d = cardData({ label: "x", stats: tradeStats(trades), trades, reconciliation: null, host: "h" });
    expect(d.period).toBeNull();
    expect(d.series).toEqual([0]);
  });
});
