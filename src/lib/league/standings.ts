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
  liquidated: boolean | null;
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
function periodFor(start: number, now: number) {
  const age = now - start;
  return age <= 7 * DAY - 3_600_000 ? "perpWeek" : age <= 30 * DAY - 3_600_000 ? "perpMonth" : "perpAllTime";
}

export function weekResult(portfolio: HlPortfolio | null, start: number, end: number, now = Date.now()): { pnl: number; base: number; ret: number | null } | null {
  const p = portfolio?.find(([name]) => name === periodFor(start, now))?.[1];
  if (!p?.pnlHistory.length) return null;
  const pnl = at(p.pnlHistory, end) - at(p.pnlHistory, start);
  const startValue = at(p.accountValueHistory, start);
  const during = p.accountValueHistory.filter(([ts]) => ts >= start && ts <= end).map(([, v]) => Number(v));
  // The average stops a deposit into an empty account mid-week from posting +5,000%.
  const base = Math.max(startValue, during.length ? during.reduce((a, b) => a + b, 0) / during.length : 0);
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
    if (f.liquidation?.liquidatedUser.toLowerCase() === address) liquidated = true;
  }
  return { closed, liquidated };
}

/** Ranked by return, best first; the rest sat the week out (no perps, or under MIN_ACCOUNT). */
export function rank(rows: Standing[]): { ranked: Standing[]; sittingOut: Standing[] } {
  // Holding a position all week counts: its PnL moved even with no fills.
  const inPlay = (s: Standing) => s.ret != null && ((s.closed ?? 0) > 0 || Math.abs(s.pnl) >= 0.01);
  return { ranked: rows.filter(inPlay).sort((a, b) => b.ret! - a.ret!), sittingOut: rows.filter((s) => !inPlay(s)) };
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

/**
 * Every entrant's week. Portfolios first (one cheap request each); fills, which can be heavy, only
 * until `deadline`, so a big league still renders inside the function's time limit.
 */
export async function standings(season: Season, client: HyperliquidClient, now = Date.now(), deadline = now + 40_000): Promise<Standing[]> {
  const end = Math.min(now, season.end);
  const entrants = [...new Map(season.entrants.map((e) => [e.address.toLowerCase(), { ...e, address: e.address.toLowerCase() }])).values()];
  const weeks = await pool(entrants, 4, (e) => client.portfolio(e.address).then((p) => weekResult(p, season.start, end, now)).catch(() => null));
  return pool(entrants, 4, async (e, i): Promise<Standing> => {
    const w = weeks[i] ?? { pnl: 0, base: 0, ret: null };
    let stats: { closed: number | null; liquidated: boolean | null } = { closed: null, liquidated: null };
    if (w.ret != null && Date.now() < deadline) {
      const fills = await client.info<HlFill[]>({ type: "userFillsByTime", user: e.address, startTime: season.start, endTime: end }).catch(() => null);
      if (Array.isArray(fills)) stats = fillStats(fills, e.address);
    }
    return { ...e, ...w, ...stats };
  });
}
