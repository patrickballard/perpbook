// Real-world fill shapes the engine has to get right. The liquidation fill below is modelled on
// one of James Wynn's from 27 May 2025: an ordinary "Close Long" with a `liquidation` record.

import { describe, expect, it } from "vitest";
import { normaliseFills } from "../hyperliquid/normalise";
import type { HlFill } from "../hyperliquid/types";
import { dailyPnl } from "./stats";
import { buildTrades } from "./trades";

let tid = 1;
const raw = (p: Partial<HlFill> & Pick<HlFill, "side" | "sz" | "px" | "startPosition" | "dir" | "time">): HlFill => ({
  coin: "BTC",
  closedPnl: "0",
  hash: `0x${tid.toString(16)}`,
  oid: tid,
  crossed: true,
  fee: "0",
  tid: tid++,
  feeToken: "USDC",
  ...p,
});

describe("liquidations", () => {
  it("closes the trade on a market liquidation and counts its loss", () => {
    const trades = buildTrades(
      normaliseFills([
        raw({ side: "B", sz: "8.08272", px: "109700", startPosition: "0", dir: "Open Long", time: 1, fee: "350" }),
        raw({
          side: "A",
          sz: "8.08272",
          px: "107533.0",
          startPosition: "8.08272",
          dir: "Close Long",
          closedPnl: "-17515.25",
          fee: "208.598191",
          time: 2,
          liquidation: { liquidatedUser: "0x5078c2fbea2b2ad61bc840bc023e35fce56bedb6", markPx: "107598.0", method: "market" },
        }),
      ]),
    );
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ status: "closed", direction: "long", partialHistory: false });
    expect(trades[0].netPnl).toBeCloseTo(-17515.25 - 350 - 208.598191);
  });

  it("handles the older 'Liquidated Cross Long' direction the same way", () => {
    const fills = normaliseFills([
      raw({ side: "B", sz: "2", px: "100", startPosition: "0", dir: "Open Long", time: 1 }),
      raw({ side: "A", sz: "2", px: "80", startPosition: "2", dir: "Liquidated Cross Long", closedPnl: "-40", fee: "0.5", time: 2 }),
    ]);
    expect(fills).toHaveLength(2);
    const [t] = buildTrades(fills);
    expect(t).toMatchObject({ status: "closed" });
    expect(t.netPnl).toBeCloseTo(-40.5);
  });

  it("counts a liquidation that happens over many fills at once as one trade", () => {
    const fills = normaliseFills([
      raw({ side: "B", sz: "3", px: "100", startPosition: "0", dir: "Open Long", time: 1 }),
      ...[0, 1, 2].map((i) =>
        raw({ side: "A", sz: "1", px: String(90 - i), startPosition: String(3 - i), dir: "Close Long", closedPnl: String(-(10 + i)), time: 5, liquidation: { liquidatedUser: "0x", markPx: "90", method: "market" } }),
      ),
    ]);
    const trades = buildTrades(fills);
    expect(trades).toHaveLength(1);
    expect(trades[0].grossPnl).toBeCloseTo(-33);
    expect(dailyPnl(fills, [], "UTC").reduce((s, d) => s + d.net, 0)).toBeCloseTo(-33);
  });
});

describe("other real fill patterns", () => {
  it("keeps auto-deleveraging fills and lets them partly close a position", () => {
    const trades = buildTrades(
      normaliseFills([
        raw({ side: "A", sz: "5", px: "50", startPosition: "0", dir: "Open Short", time: 1 }),
        raw({ side: "B", sz: "2", px: "40", startPosition: "-5", dir: "Auto-Deleveraging", closedPnl: "20", time: 2 }),
      ]),
    );
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ direction: "short", status: "open", maxSize: 5 });
    expect(trades[0].grossPnl).toBeCloseTo(20);
  });

  it("treats partial closes and re-adds as one trade until flat", () => {
    const trades = buildTrades(
      normaliseFills([
        raw({ side: "B", sz: "2", px: "100", startPosition: "0", dir: "Open Long", time: 1 }),
        raw({ side: "A", sz: "1", px: "110", startPosition: "2", dir: "Close Long", closedPnl: "10", time: 2 }),
        raw({ side: "B", sz: "1", px: "120", startPosition: "1", dir: "Open Long", time: 3 }),
        raw({ side: "A", sz: "2", px: "115", startPosition: "2", dir: "Close Long", closedPnl: "25", time: 4 }),
      ]),
    );
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ status: "closed", fillCount: 4, maxSize: 2 });
    expect(trades[0].entryAvg).toBeCloseTo((2 * 100 + 120) / 3);
    expect(trades[0].grossPnl).toBeCloseTo(35);
  });

  it("treats TWAP slices like any other fills, builder fees included in the fee", () => {
    const trades = buildTrades(
      normaliseFills([
        raw({ side: "B", sz: "1", px: "100", startPosition: "0", dir: "Open Long", time: 1, twapId: 77, fee: "0.06", builderFee: "0.01" }),
        raw({ side: "B", sz: "1", px: "101", startPosition: "1", dir: "Open Long", time: 61_000, twapId: 77, fee: "0.06", builderFee: "0.01" }),
        raw({ side: "A", sz: "2", px: "105", startPosition: "2", dir: "Close Long", closedPnl: "9", time: 120_000 }),
      ]),
    );
    expect(trades).toHaveLength(1);
    expect(trades[0].fees).toBeCloseTo(0.12);
    expect(trades[0].netPnl).toBeCloseTo(8.88);
  });
});
