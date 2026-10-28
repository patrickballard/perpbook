// League standings from Hyperliquid's own numbers: each entrant's perps PnL over the week (after
// fees and funding, open positions included) as a % of their account, so a $500 account can beat
// a whale. Fills are only used for the trade count and to spot liquidations.

import type { HyperliquidClient } from "../hyperliquid/client";
import type { HlFill, HlPortfolio } from "../hyperliquid/types";
import type { Entrant, Season } from "./seasons";

/** Below this the % is noise. */
export const MIN_ACCOUNT = 100;

const DAY = 86_400_000;

export type Standing = Entrant & {
  pnl: number;
  /** What the % is of: the account at the start, or its average over the week if that's larger. */
  base: number;
  ret: number | null;
  /** Trades closed this week (position back to zero or flipped); null if fills weren't checked. */
  closed: number | null;
  /** More fills than were checked: `closed` is a lower bound, and a late liquidation could be missed. */
  closedAtLeast?: boolean;
  liquidated: boolean | null;
  /** Hyperliquid didn't answer for this wallet this time; the next refresh tries again. */
  failed?: boolean;
  /** When the numbers were fetched (ms), which can be before the render that shows them. */
  asOf?: number;
};

type Series = [number, string][];

/** The value at the last point at or before t; 0 before the first point (a wallet that didn't exist yet). */
const at = (s: Series, t: number) => {
  let v = 0;
  for (const [ts, x] of s) {
    if (ts > t) break;
    v = Number(x);
  }
  return v;
};

/**
 * Hyperliquid's weekly history has points every few hours but only reaches back 7 days; after
 * that, the monthly one (a point a day or so) and then all-time.
 */
export const weeklyHistoryCovers = (start: number, now: number) => now - start <= 7 * DAY - 3_600_000;
const periodFor = (start: number, now: number) => (weeklyHistoryCovers(start, now) ? "week" : now - start <= 30 * DAY - 3_600_000 ? "month" : "allTime");

/** The account at the start, or its average over the week if that's larger: a deposit into an empty account mid-week shouldn't post +5,000%. */
function baseOf(values: Series, start: number, end: number) {
  const during = values.filter(([ts]) => ts >= start && ts <= end).map(([, v]) => Number(v));
  return Math.max(at(values, start), during.length ? during.reduce((a, b) => a + b, 0) / during.length : 0);
}

export function weekResult(portfolio: HlPortfolio | null, start: number, end: number, now = Date.now()): { pnl: number; base: number; ret: number | null } | null {
  const period = periodFor(start, now);
  const series = (name: string) => portfolio?.find(([n]) => n === name)?.[1];
  const perps = series(`perp${period[0].toUpperCase()}${period.slice(1)}`);
  if (!perps?.pnlHistory.length) return null;
  const pnl = at(perps.pnlHistory, end) - at(perps.pnlHistory, start);
  let base = baseOf(perps.accountValueHistory, start, end);
  // Unified and portfolio-margin accounts keep their margin in the spot balance, so their perps
  // account reads $0 however much they trade: measure them against the whole account.
  const whole = series(period);
  if (base < MIN_ACCOUNT && whole) base = baseOf(whole.accountValueHistory, start, end);
  return { pnl, base, ret: base >= MIN_ACCOUNT ? pnl / base : null };
}

const isPerp = (f: HlFill) => !f.coin.startsWith("@") && !f.coin.startsWith("#") && !f.coin.includes("/");

export function fillStats(fills: HlFill[], address: string): { closed: number; liquidated: boolean } {
  let closed = 0;
  let liquidated = false;
  for (const f of fills.filter(isPerp)) {
    const before = Number(f.startPosition);
    const after = before + (f.side === "B" ? Number(f.sz) : -Number(f.sz));
    if (before !== 0 && (Math.abs(after) <= 1e-9 * Math.abs(before) || after > 0 !== before > 0)) closed++;
    if (f.liquidation?.liquidatedUser?.toLowerCase() === address) liquidated = true;
  }
  return { closed, liquidated };
}

/** Ranked by return, best first; who sat the week out (no perps, or under MIN_ACCOUNT); and who couldn't be loaded. */
export function rank(rows: Standing[]): { ranked: Standing[]; sittingOut: Standing[]; failed: Standing[] } {
  // Holding a position all week counts: its PnL moved even with no fills.
  const inPlay = (s: Standing) => !s.failed && s.ret != null && ((s.closed ?? 0) > 0 || Math.abs(s.pnl) >= 0.01);
  return {
    ranked: rows.filter(inPlay).sort((a, b) => b.ret! - a.ret!),
    sittingOut: rows.filter((s) => !s.failed && !inPlay(s)),
    failed: rows.filter((s) => s.failed),
  };
}

/** Run `fn` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Keeps a result between renders (the page passes Next's data cache); a throw is never kept. */
export type Memo = <T>(key: string, fn: () => Promise<T>) => Promise<T>;

const FILLS_PAGE = 2_000;

/**
 * Trades closed and liquidations from the week's first page of fills. Anyone with more (a bot,
 * mostly) gets a lower bound on trades, plus their latest page checked for a liquidation, which is
 * far likelier late in the week than early.
 */
async function weekFills(client: HyperliquidClient, address: string, start: number, end: number) {
  const first = await client.info<HlFill[]>({ type: "userFillsByTime", user: address, startTime: start, endTime: end });
  if (!Array.isArray(first)) throw new Error("unexpected fills response");
  const stats = fillStats(first, address);
  if (first.length < FILLS_PAGE) return stats;
  const latest = await client.info<HlFill[]>({ type: "userFills", user: address });
  const lateLiquidation = Array.isArray(latest) && fillStats(latest.filter((f) => f.time >= start && f.time <= end), address).liquidated;
  return { ...stats, closedAtLeast: true, liquidated: stats.liquidated || lateLiquidation };
}

/**
 * Every entrant's week, in two passes, 4 requests at a time: portfolios first (one cheap request
 * each, and all the ranking needs), then fills, top of the table first, for the trade counts and
 * liquidations. The client should stop its requests at the render's deadline. With `memo`, each
 * result is kept, so a league too big for one render fills in over a few: entrants not reached
 * are marked failed (and fills not reached left out), and only they are fetched next time.
 */
export async function standings(season: Season, client: HyperliquidClient, now = Date.now(), memo: Memo = (_, fn) => fn()): Promise<Standing[]> {
  const end = Math.min(now, season.end);
  // A wallet entered twice counts once, under whoever entered it first.
  const seen = new Set<string>();
  const entrants = season.entrants.map((e) => ({ ...e, address: e.address.toLowerCase() })).filter((e) => !seen.has(e.address) && !!seen.add(e.address));
  const key = (e: Entrant, what: string) => `league:${season.slug}:${e.address}:${what}`;

  const rows = await pool(entrants, 4, (e): Promise<Standing> =>
    memo(key(e, "week"), async () => ({ ...(weekResult(await client.portfolio(e.address), season.start, end, now) ?? { pnl: 0, base: 0, ret: null }), asOf: Date.now() })).then(
      (w) => ({ ...e, ...w, closed: null, liquidated: null }),
      () => ({ ...e, pnl: 0, base: 0, ret: null, closed: null, liquidated: null, failed: true }),
    ),
  );
  const order = rank(rows).ranked;
  const stats = await pool(order, 4, (s) => memo(key(s, "fills"), () => weekFills(client, s.address, season.start, end)).catch(() => null));
  const byAddress = new Map(order.map((s, i) => [s.address, stats[i]]));
  return rows.map((s) => ({ ...s, ...byAddress.get(s.address) }));
}
