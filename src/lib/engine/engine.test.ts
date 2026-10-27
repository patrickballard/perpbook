import { describe, expect, it } from "vitest";
import type { Fill, FundingEvent, HlFill } from "../hyperliquid/types";
import { normaliseFills } from "../hyperliquid/normalise";
import { buildTrades } from "./trades";
import { dailyPnl, equityCurve, greenStreak, reconcile, tradeStats } from "./stats";

let n = 0;
const fill = (p: Partial<Fill> & Pick<Fill, "side" | "sz" | "px" | "startPosition" | "time">): Fill => ({
  id: `f${++n}`,
  coin: "BTC",
  closedPnl: 0,
  fee: 0,
  ...p,
});

describe("buildTrades", () => {
  it("builds a simple long round trip", () => {
    const [t] = buildTrades([
      fill({ side: "buy", sz: 1, px: 100, startPosition: 0, time: 1, fee: 0.1 }),
      fill({ side: "sell", sz: 1, px: 110, startPosition: 1, time: 2, fee: 0.1, closedPnl: 10 }),
    ]);
    expect(t).toMatchObject({ direction: "long", status: "closed", entryAvg: 100, exitAvg: 110, maxSize: 1 });
    expect(t.grossPnl).toBeCloseTo(10);
    expect(t.fees).toBeCloseTo(0.2);
    expect(t.netPnl).toBeCloseTo(9.8);
    expect(t.partialHistory).toBe(false);
  });

  it("treats scaling in and out as one trade, not four", () => {
    const trades = buildTrades([
      fill({ side: "buy", sz: 1, px: 100, startPosition: 0, time: 1 }),
      fill({ side: "buy", sz: 1, px: 110, startPosition: 1, time: 2 }),
      fill({ side: "sell", sz: 1, px: 120, startPosition: 2, time: 3, closedPnl: 15 }),
      fill({ side: "sell", sz: 1, px: 100, startPosition: 1, time: 4, closedPnl: -5 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ entryAvg: 105, exitAvg: 110, maxSize: 2, fillCount: 4 });
    expect(trades[0].grossPnl).toBeCloseTo(10);
  });

  it("splits a flip into a closed trade and a new open trade", () => {
    const trades = buildTrades([
      fill({ side: "buy", sz: 1, px: 100, startPosition: 0, time: 1 }),
      fill({ side: "sell", sz: 3, px: 90, startPosition: 1, time: 2, closedPnl: -10, fee: 0.3 }),
    ]);
    expect(trades).toHaveLength(2);
    const [long, short] = trades;
    expect(long).toMatchObject({ direction: "long", status: "closed", exitAvg: 90 });
    expect(long.fees).toBeCloseTo(0.1);
    expect(long.netPnl).toBeCloseTo(-10.1);
    expect(short).toMatchObject({ direction: "short", status: "open", entryAvg: 90, maxSize: 2 });
    expect(short.fees).toBeCloseTo(0.2);
  });

  it("flags positions that were already open before our history starts", () => {
    const [t] = buildTrades([
      fill({ side: "sell", sz: 1, px: 105, startPosition: 2, time: 1, closedPnl: 5 }),
      fill({ side: "sell", sz: 1, px: 105, startPosition: 1, time: 2, closedPnl: 5 }),
    ]);
    expect(t).toMatchObject({ direction: "long", status: "closed", partialHistory: true, entryAvg: null, maxSize: 2 });
    expect(t.grossPnl).toBeCloseTo(10);
  });

  it("closes a trade as partial when fills are missing", () => {
    const trades = buildTrades([
      fill({ side: "buy", sz: 1, px: 100, startPosition: 0, time: 1 }),
      // We never saw the fills that took the position from 1 to 3.
      fill({ side: "sell", sz: 3, px: 120, startPosition: 3, time: 5, closedPnl: 50 }),
    ]);
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ status: "closed", partialHistory: true });
    expect(trades[1]).toMatchObject({ status: "closed", partialHistory: true });
  });

  it("orders same-millisecond fills by execution, not by trade id", () => {
    // One sweep, two fills in the same block; the later fill has the smaller id.
    const trades = buildTrades([
      fill({ id: "9", side: "sell", sz: 2, px: 100, startPosition: 0, time: 1 }),
      fill({ id: "1", side: "sell", sz: 1, px: 99, startPosition: -2, time: 1 }),
      fill({ id: "5", side: "buy", sz: 3, px: 90, startPosition: -3, time: 2, closedPnl: 28 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ direction: "short", status: "closed", partialHistory: false, maxSize: 3, fillCount: 3 });
    expect(trades[0].entryAvg).toBeCloseTo(299 / 3);
  });

  it("keeps a huge position's small same-millisecond fills in order", () => {
    // A 2.6M NEAR position adding in fills under 1 NEAR: starting positions only a fraction of a
    // coin apart must still chain exactly, or the trade splits into dozens of fake ones.
    const big = 2_600_000;
    const trades = buildTrades([
      fill({ id: "a", side: "buy", sz: big, px: 5, startPosition: 0, time: 1 }),
      fill({ id: "1", side: "buy", sz: 50, px: 5, startPosition: big + 1.1, time: 2 }),
      fill({ id: "5", side: "buy", sz: 0.4, px: 5, startPosition: big + 51.1, time: 2 }),
      fill({ id: "9", side: "buy", sz: 1.1, px: 5, startPosition: big, time: 2 }),
      fill({ id: "b", side: "sell", sz: big + 51.5, px: 6, startPosition: big + 51.5, time: 3, closedPnl: 2_600_051.5 }),
    ]);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ status: "closed", partialHistory: false, fillCount: 5 });
  });

  it("orders a same-millisecond flip correctly even when it is the first group we see", () => {
    const trades = buildTrades([
      fill({ id: "1", side: "buy", sz: 3, px: 100, startPosition: -1, time: 1, closedPnl: 1 }),
      fill({ id: "2", side: "sell", sz: 1, px: 101, startPosition: 0, time: 1 }),
    ]);
    expect(trades.map((t) => [t.direction, t.status, t.partialHistory])).toEqual([
      ["short", "closed", false],
      ["long", "open", false],
    ]);
  });

  it("gives unique keys to trades that open in the same millisecond", () => {
    const trades = buildTrades([
      fill({ id: "a", side: "buy", sz: 1, px: 100, startPosition: 0, time: 1 }),
      fill({ id: "b", side: "sell", sz: 1, px: 101, startPosition: 1, time: 1, closedPnl: 1 }),
      fill({ id: "c", side: "buy", sz: 1, px: 101, startPosition: 0, time: 1 }),
    ]);
    expect(trades).toHaveLength(2);
    expect(new Set(trades.map((t) => t.key)).size).toBe(2);
  });

  it("keeps a trade's key when unrelated older fills drop out of history", () => {
    const older = fill({ id: "old", coin: "ETH", side: "buy", sz: 1, px: 10, startPosition: 0, time: 1 });
    const open = fill({ id: "open", side: "buy", sz: 1, px: 100, startPosition: 0, time: 2 });
    const close = fill({ id: "close", side: "sell", sz: 1, px: 101, startPosition: 1, time: 3, closedPnl: 1 });
    const key = (fills: Fill[]) => buildTrades(fills).find((t) => t.coin === "BTC")!.key;
    expect(key([older, open, close])).toBe(key([open, close]));
  });

  it("keeps coins independent", () => {
    const trades = buildTrades([
      fill({ coin: "BTC", side: "buy", sz: 1, px: 100, startPosition: 0, time: 1 }),
      fill({ coin: "ETH", side: "sell", sz: 2, px: 10, startPosition: 0, time: 2 }),
      fill({ coin: "BTC", side: "sell", sz: 1, px: 101, startPosition: 1, time: 3, closedPnl: 1 }),
    ]);
    expect(trades.map((t) => [t.coin, t.direction, t.status])).toEqual([
      ["BTC", "long", "closed"],
      ["ETH", "short", "open"],
    ]);
  });

  it("gives funding to the trade that was open when it was charged", () => {
    const funding: FundingEvent[] = [
      { id: "a", coin: "BTC", usdc: -1, time: 2000 },
      { id: "b", coin: "BTC", usdc: -2, time: 6000 }, // flat by then
      { id: "c", coin: "ETH", usdc: 5, time: 2000 }, // different coin
    ];
    const [t] = buildTrades(
      [
        fill({ side: "buy", sz: 1, px: 100, startPosition: 0, time: 1000 }),
        fill({ side: "sell", sz: 1, px: 110, startPosition: 1, time: 5000, closedPnl: 10 }),
      ],
      funding,
    );
    expect(t.funding).toBeCloseTo(-1);
    expect(t.netPnl).toBeCloseTo(9);
  });
});

describe("normaliseFills", () => {
  const raw = (p: Partial<HlFill>): HlFill => ({
    coin: "BTC",
    px: "100",
    sz: "1",
    side: "B",
    time: 1,
    startPosition: "0",
    dir: "Open Long",
    closedPnl: "0",
    hash: "0xabc",
    oid: 1,
    crossed: true,
    fee: "0.05",
    tid: 1,
    ...p,
  });

  it("drops spot fills and duplicates, keeps builder perps", () => {
    const out = normaliseFills([
      raw({}),
      raw({}), // duplicate
      raw({ coin: "@107", dir: "Buy", tid: 2 }),
      raw({ coin: "PURR/USDC", dir: "Sell", tid: 3 }),
      raw({ coin: "xyz:TSLA", dir: "Open Short", side: "A", tid: 4 }),
    ]);
    expect(out.map((f) => f.coin)).toEqual(["BTC", "xyz:TSLA"]);
    expect(out[0]).toMatchObject({ px: 100, sz: 1, side: "buy", fee: 0.05 });
    expect(out[1].side).toBe("sell");
  });
});

describe("stats", () => {
  const trades = buildTrades([
    fill({ side: "buy", sz: 1, px: 100, startPosition: 0, time: Date.UTC(2026, 9, 12, 9) }),
    fill({ side: "sell", sz: 1, px: 110, startPosition: 1, time: Date.UTC(2026, 9, 12, 10), closedPnl: 10 }),
    fill({ side: "sell", sz: 1, px: 100, startPosition: 0, time: Date.UTC(2026, 9, 13, 14) }),
    fill({ side: "buy", sz: 1, px: 104, startPosition: -1, time: Date.UTC(2026, 9, 13, 15), closedPnl: -4 }),
    fill({ side: "buy", sz: 1, px: 100, startPosition: 0, time: Date.UTC(2026, 9, 14, 9) }),
  ]);

  it("computes win rate, profit factor and expectancy on closed trades only", () => {
    const s = tradeStats(trades, "UTC");
    expect(s.trades).toBe(2);
    expect(s.winRate).toBeCloseTo(0.5);
    expect(s.profitFactor).toBeCloseTo(2.5);
    expect(s.expectancy).toBeCloseTo(3);
    expect(s.best?.netPnl).toBeCloseTo(10);
    expect(s.worst?.netPnl).toBeCloseTo(-4);
    expect(s.byHour.find((b) => b.label === "09")?.trades).toBe(1);
    expect(s.byWeekday.find((b) => b.label === "Mon")?.net).toBeCloseTo(10);
    expect(s.byDirection.map((b) => [b.label, b.trades])).toEqual([
      ["long", 1],
      ["short", 1],
    ]);
  });

  it("builds daily PnL, the equity curve and the green streak", () => {
    const fills: Fill[] = [
      fill({ side: "sell", sz: 1, px: 1, startPosition: 1, time: Date.UTC(2026, 9, 12, 23, 30), closedPnl: 5, fee: 1 }),
      fill({ side: "sell", sz: 1, px: 1, startPosition: 1, time: Date.UTC(2026, 9, 13, 0, 30), closedPnl: -2 }),
      fill({ side: "sell", sz: 1, px: 1, startPosition: 1, time: Date.UTC(2026, 9, 14, 12), closedPnl: 3 }),
    ];
    const funding: FundingEvent[] = [{ id: "x", coin: "BTC", usdc: 0.5, time: Date.UTC(2026, 9, 14, 13) }];
    const days = dailyPnl(fills, funding, "UTC");
    expect(days.map((d) => [d.date, +d.net.toFixed(2)])).toEqual([
      ["2026-10-12", 4],
      ["2026-10-13", -2],
      ["2026-10-14", 3.5],
    ]);
    expect(equityCurve(days).at(-1)?.cumulative).toBeCloseTo(5.5);
    expect(greenStreak(days)).toBe(1);
  });
});

describe("reconcile", () => {
  const day = (net: number) => ({ date: "2026-10-01", realised: net, fees: 0, funding: 0, net });

  it("matches when realised plus unrealised equals Hyperliquid's PnL", () => {
    const r = reconcile([day(4500), day(26.45)], [{ unrealizedPnl: -3461.85, notional: 70_000 }, { unrealizedPnl: -496.81, notional: 13_000 }], 568.27)!;
    expect(r.perpbook).toBeCloseTo(567.79);
    expect(r.matches).toBe(true);
  });

  it("allows for prices moving between snapshots, in proportion to what's open", () => {
    // $9 apart: a 0.01% move on $83k of positions, but far too much for a flat account.
    expect(reconcile([day(585.96)], [{ unrealizedPnl: 0, notional: 83_000 }], 576.63)!.matches).toBe(true);
    expect(reconcile([day(585.96)], [], 576.63)!.matches).toBe(false);
  });

  it("reports the difference when history is missing", () => {
    const r = reconcile([day(100)], [], 350)!;
    expect(r.matches).toBe(false);
    expect(r.difference).toBeCloseTo(250);
  });

  it("does nothing without Hyperliquid's number", () => {
    expect(reconcile([day(100)], [], null)).toBeNull();
  });
});
