import { describe, expect, it } from "vitest";
import { compactUsd, demoShareStats, shareStats, sparkline } from "./share";

describe("shareStats", () => {
  it("reads perps-only all-time and 30-day PnL and volume", () => {
    const s = shareStats([
      ["allTime", { pnlHistory: [[1, "999"]], accountValueHistory: [], vlm: "5" }],
      ["perpMonth", { pnlHistory: [[1, "0"], [2, "602.4"]], accountValueHistory: [], vlm: "1" }],
      ["perpAllTime", { pnlHistory: [[1, "0"], [2, "-50"], [3, "700.4"]], accountValueHistory: [], vlm: "1154828.88" }],
    ]);
    expect(s).toEqual({ allTime: 700.4, month: 602.4, volume: 1154828.88, series: [0, -50, 700.4] });
  });

  it("is null for wallets with no perps history", () => {
    expect(shareStats([["perpAllTime", { pnlHistory: [], accountValueHistory: [], vlm: "0" }]])).toBeNull();
    expect(shareStats(null)).toBeNull();
  });

  it("builds demo stats from the demo account", () => {
    const s = demoShareStats(Date.UTC(2026, 9, 15, 20));
    expect(s.series.at(-1)).toBeCloseTo(s.allTime);
    expect(s.volume).toBeGreaterThan(0);
  });
});

describe("sparkline", () => {
  it("scales the series into the box, top is highest", () => {
    expect(sparkline([0, 10, 5], 100, 50)).toBe("0.0,50.0 50.0,0.0 100.0,25.0");
    expect(sparkline([3], 100, 50)).toBe("0,25 100,25");
  });
});

describe("compactUsd", () => {
  it("abbreviates large amounts", () => {
    expect(compactUsd(1154828.88)).toBe("$1.15M");
    expect(compactUsd(4200)).toBe("$4.2k");
    expect(compactUsd(-12)).toBe("$12");
  });
});
