import type { Fill, FundingEvent } from "../hyperliquid/types";
import type { Trade } from "./trades";

export type Bucket = { label: string; trades: number; net: number; wins: number; losses: number };

export type TradeStats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  net: number;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  best: Trade | null;
  worst: Trade | null;
  avgHoldMs: number | null;
  fees: number;
  funding: number;
  byCoin: Bucket[];
  byDirection: Bucket[];
  byHour: Bucket[];
  byWeekday: Bucket[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Building an Intl.DateTimeFormat is slow, and we format once per fill and trade; keep one per time zone.
const cached = (make: (timeZone?: string) => Intl.DateTimeFormat) => {
  const m = new Map<string | undefined, Intl.DateTimeFormat>();
  return (timeZone?: string) => {
    let f = m.get(timeZone);
    if (!f) m.set(timeZone, (f = make(timeZone)));
    return f;
  };
};
const hourWeekdayFmt = cached(
  (timeZone) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23", weekday: "short" }),
);
const dayFmt = cached((timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }));

function partsIn(ms: number, timeZone?: string) {
  const p = hourWeekdayFmt(timeZone).formatToParts(new Date(ms));
  const hour = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const wd = p.find((x) => x.type === "weekday")?.value ?? "Mon";
  return { hour, weekday: WEEKDAYS.indexOf(wd) };
}

function bucketise(trades: Trade[], keyOf: (t: Trade) => string, order?: string[]): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const k of order ?? []) m.set(k, { label: k, trades: 0, net: 0, wins: 0, losses: 0 });
  for (const t of trades) {
    const k = keyOf(t);
    const b = m.get(k) ?? { label: k, trades: 0, net: 0, wins: 0, losses: 0 };
    b.trades++;
    b.net += t.netPnl;
    if (t.netPnl > 0) b.wins++;
    else if (t.netPnl < 0) b.losses++;
    m.set(k, b);
  }
  const out = [...m.values()];
  return order ? out : out.sort((a, b) => b.net - a.net);
}

/** Stats over closed trades only; open trades have no final result yet. */
export function tradeStats(all: Trade[], timeZone?: string): TradeStats {
  const trades = all.filter((t) => t.status === "closed");
  const winners = trades.filter((t) => t.netPnl > 0);
  const losers = trades.filter((t) => t.netPnl < 0);
  const sum = (xs: Trade[]) => xs.reduce((s, t) => s + t.netPnl, 0);
  const grossWin = sum(winners);
  const grossLoss = sum(losers);
  const net = sum(trades);
  const decided = winners.length + losers.length;
  const sorted = [...trades].sort((a, b) => a.netPnl - b.netPnl);
  const holds = trades.filter((t) => t.closedAt != null).map((t) => t.closedAt! - t.openedAt);

  return {
    trades: trades.length,
    wins: winners.length,
    losses: losers.length,
    winRate: decided ? winners.length / decided : null,
    net,
    avgWin: winners.length ? grossWin / winners.length : null,
    avgLoss: losers.length ? grossLoss / losers.length : null,
    profitFactor: losers.length ? grossWin / Math.abs(grossLoss) : winners.length ? Infinity : null,
    expectancy: trades.length ? net / trades.length : null,
    best: sorted.length && sorted.at(-1)!.netPnl > 0 ? sorted.at(-1)! : null,
    worst: sorted.length && sorted[0].netPnl < 0 ? sorted[0] : null,
    avgHoldMs: holds.length ? holds.reduce((s, x) => s + x, 0) / holds.length : null,
    fees: trades.reduce((s, t) => s + t.fees, 0),
    funding: trades.reduce((s, t) => s + t.funding, 0),
    byCoin: bucketise(trades, (t) => t.coin),
    byDirection: bucketise(trades, (t) => t.direction, ["long", "short"]),
    byHour: bucketise(
      trades,
      (t) => String(partsIn(t.openedAt, timeZone).hour).padStart(2, "0"),
      Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")),
    ),
    byWeekday: bucketise(trades, (t) => WEEKDAYS[partsIn(t.openedAt, timeZone).weekday], WEEKDAYS),
  };
}

export type Day = {
  date: string; // YYYY-MM-DD in the chosen time zone
  realised: number;
  fees: number;
  funding: number;
  net: number;
};

// Every time zone's offset is a multiple of 15 minutes, so the date only changes on a quarter
// hour; funding is hourly, so tens of thousands of timestamps share a few thousand quarters.
const QUARTER_HOUR = 15 * 60_000;
const dayKeys = new Map<string | undefined, Map<number, string>>();

export const dayKey = (ms: number, timeZone?: string) => {
  let byQuarter = dayKeys.get(timeZone);
  if (!byQuarter) dayKeys.set(timeZone, (byQuarter = new Map()));
  const q = Math.floor(ms / QUARTER_HOUR);
  let key = byQuarter.get(q);
  if (key === undefined) byQuarter.set(q, (key = dayFmt(timeZone).format(new Date(q * QUARTER_HOUR))));
  return key;
};

/**
 * Account-level daily PnL straight from fills and funding (realised − fees + funding),
 * so it matches what the exchange shows even when trades straddle midnight.
 */
export function dailyPnl(fills: Fill[], funding: FundingEvent[], timeZone?: string): Day[] {
  const m = new Map<string, Day>();
  const get = (k: string) => {
    let d = m.get(k);
    if (!d) {
      d = { date: k, realised: 0, fees: 0, funding: 0, net: 0 };
      m.set(k, d);
    }
    return d;
  };
  for (const f of fills) {
    const d = get(dayKey(f.time, timeZone));
    d.realised += f.closedPnl;
    d.fees += f.fee;
  }
  for (const f of funding) get(dayKey(f.time, timeZone)).funding += f.usdc;
  for (const d of m.values()) d.net = d.realised - d.fees + d.funding;
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function equityCurve(days: Day[]): { date: string; cumulative: number }[] {
  let c = 0;
  return days.map((d) => ({ date: d.date, cumulative: (c += d.net) }));
}

export function greenStreak(days: Day[]): number {
  let n = 0;
  for (const d of [...days].reverse()) {
    if (Math.abs(d.net) < 0.005) continue;
    if (d.net > 0) n++;
    else break;
  }
  return n;
}

export type Reconciliation = {
  /** Realised from every fill and funding payment we have: closed PnL − fees + funding. */
  realised: number;
  unrealised: number;
  perpbook: number;
  hyperliquid: number;
  difference: number;
  matches: boolean;
};

/**
 * Compare our numbers with Hyperliquid's own all-time perps PnL. They agree when we
 * have the account's whole history; otherwise the difference is PnL from before the
 * oldest fill we have.
 */
export function reconcile(days: Day[], positions: { unrealizedPnl: number; notional: number }[], hyperliquidPnl: number | null): Reconciliation | null {
  if (hyperliquidPnl == null) return null;
  const realised = days.reduce((s, d) => s + d.net, 0);
  const unrealised = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const perpbook = realised + unrealised;
  const difference = hyperliquidPnl - perpbook;
  // Unrealised PnL moves with prices between Hyperliquid's snapshot and ours; allow 0.1% of what's open.
  const notional = positions.reduce((s, p) => s + p.notional, 0);
  const matches = Math.abs(difference) <= Math.max(1, notional * 0.001);
  return { realised, unrealised, perpbook, hyperliquid: hyperliquidPnl, difference, matches };
}

/**
 * Whether we have the account's whole history: our oldest fill is within a few days of when
 * Hyperliquid's own PnL record starts. If it is, a gap can't be blamed on missing history.
 */
export const hasFullHistory = (firstFillTime: number | null, hyperliquidSince: number | null) =>
  firstFillTime != null && hyperliquidSince != null && firstFillTime - hyperliquidSince < 3 * 86_400_000;
