import { describe, expect, it } from "vitest";
import { cardData } from "./card";
import { tradeStats } from "./engine/stats";

describe("cardData", () => {
  it("summarises the dashboard's numbers for the card", () => {
    const stats = { ...tradeStats([]), net: -23_393_876.68, trades: 1_234, winRate: 0.42, profitFactor: 0.87 };
    const d = cardData({
      label: "0x5078…edb6",
      stats,
      equity: [
        { date: "2025-12-30", cumulative: 10 },
        { date: "2026-10-26", cumulative: -23_393_876.68 },
      ],
      reconciliation: null,
      host: "perpbook.vercel.app",
    });
    expect(d.period).toBe("30 Dec 2025 – 26 Oct 2026");
    expect(d.stats).toEqual([
      { label: "Win rate", value: "42%" },
      { label: "Profit factor", value: "0.87" },
      { label: "Trades", value: "1,234" },
    ]);
    expect(d.series).toEqual([0, 10, -23_393_876.68]);
    expect(d.matches).toBe(false);
  });

  it("leaves out the year on the start date when the period is within one year", () => {
    const d = cardData({ label: "x", stats: tradeStats([]), equity: [{ date: "2026-08-12", cumulative: 1 }, { date: "2026-10-26", cumulative: 2 }], reconciliation: null, host: "h" });
    expect(d.period).toBe("12 Aug – 26 Oct 2026");
  });
});
