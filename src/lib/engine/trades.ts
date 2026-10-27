import type { Fill, FundingEvent } from "../hyperliquid/types";

export type Direction = "long" | "short";

export type Trade = {
  /**
   * Stable key: notes attach to this, so it must survive rebuilds. Built from the id of the
   * trade's first fill, which is unique; the direction keeps both sides of a flip apart.
   */
  key: string;
  coin: string;
  direction: Direction;
  status: "open" | "closed";
  openedAt: number;
  closedAt: number | null;
  /** Average entry price; null when the position was opened before our history starts. */
  entryAvg: number | null;
  exitAvg: number | null;
  maxSize: number;
  grossPnl: number;
  fees: number;
  funding: number;
  netPnl: number;
  fillCount: number;
  /** True when the position already existed at the first fill we have, so entry and PnL are incomplete. */
  partialHistory: boolean;
};

const EPS = 1e-9;
const sgn = (x: number) => (Math.abs(x) <= EPS * Math.max(1, Math.abs(x)) ? 0 : x > 0 ? 1 : -1);
const dirOf = (s: number): Direction => (s > 0 ? "long" : "short");
// Only float rounding (~1e-16 relative) separates positions that are the same. A looser 1e-6 let
// a 2.6M NEAR position mistake fills under 2.6 NEAR apart for each other and split into fake trades.
const samePos = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const afterOf = (f: Fill) => f.startPosition + (f.side === "buy" ? f.sz : -f.sz);

/**
 * One order sweeping the book produces several fills with the same timestamp, and
 * Hyperliquid's trade ids don't follow execution order. Within each timestamp, put
 * fills in the order their `startPosition`s chain together, so a sweep isn't
 * mistaken for a gap in history. Expects one coin's fills, sorted by time.
 */
function executionOrder(list: Fill[]): Fill[] {
  const out: Fill[] = [];
  for (let i = 0; i < list.length; ) {
    let j = i;
    while (j < list.length && list[j].time === list[i].time) j++;
    const group = list.slice(i, j);
    while (group.length) {
      const prev = out.at(-1);
      // Continue from the previous fill; failing that, start from the fill nothing else in the group leads to.
      let k = prev ? group.findIndex((f) => samePos(f.startPosition, afterOf(prev))) : -1;
      if (k < 0) k = group.findIndex((f) => !group.some((o) => o !== f && samePos(f.startPosition, afterOf(o))));
      out.push(group.splice(Math.max(k, 0), 1)[0]);
    }
    i = j;
  }
  return out;
}

type Builder = {
  trade: Trade;
  entryNotional: number;
  entrySz: number;
  exitNotional: number;
  exitSz: number;
};

function start(coin: string, direction: Direction, first: Fill, partial: boolean): Builder {
  return {
    trade: {
      key: `${coin}:${direction}:${first.id}`,
      coin,
      direction,
      status: "open",
      openedAt: first.time,
      closedAt: null,
      entryAvg: null,
      exitAvg: null,
      maxSize: 0,
      grossPnl: 0,
      fees: 0,
      funding: 0,
      netPnl: 0,
      fillCount: 0,
      partialHistory: partial,
    },
    entryNotional: 0,
    entrySz: 0,
    exitNotional: 0,
    exitSz: 0,
  };
}

function finish(b: Builder): Trade {
  const t = b.trade;
  t.entryAvg = b.entrySz > 0 ? b.entryNotional / b.entrySz : null;
  t.exitAvg = b.exitSz > 0 ? b.exitNotional / b.exitSz : null;
  t.netPnl = t.grossPnl - t.fees + t.funding;
  return t;
}

/**
 * Rebuild round-trip trades from fills. A trade opens when a coin's position
 * leaves zero and closes when it returns to zero; a flip (long to short in one
 * fill) closes one trade and opens the next. Hyperliquid's `startPosition` on
 * every fill is treated as the source of truth, which also lets us detect gaps.
 */
export function buildTrades(fills: Fill[], funding: FundingEvent[] = []): Trade[] {
  const byCoin = new Map<string, Fill[]>();
  for (const f of fills) {
    const list = byCoin.get(f.coin) ?? [];
    list.push(f);
    byCoin.set(f.coin, list);
  }

  const trades: Trade[] = [];

  for (const [coin, list] of byCoin) {
    list.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    let cur: Builder | null = null;
    let pos = 0;

    for (const f of executionOrder(list)) {
      const before = f.startPosition;
      const delta = f.side === "buy" ? f.sz : -f.sz;
      const after = before + delta;

      // Gap: our tracked position disagrees with what Hyperliquid says it was.
      if (cur && !samePos(before, pos)) {
        cur.trade.status = "closed";
        cur.trade.closedAt = f.time;
        cur.trade.partialHistory = true;
        trades.push(finish(cur));
        cur = null;
      }

      // Position already open when our history begins.
      if (!cur && sgn(before) !== 0) {
        cur = start(coin, dirOf(before), f, true);
        cur.trade.maxSize = Math.abs(before);
      }

      const sb = sgn(before);
      const sa = sgn(after);

      if (sb !== 0 && sa !== 0 && sb !== sa && cur) {
        // Flip: split the fill into a closing part and an opening part.
        const closeSz = Math.abs(before);
        const openSz = Math.abs(after);
        const ratio = closeSz / f.sz;
        cur.exitNotional += f.px * closeSz;
        cur.exitSz += closeSz;
        cur.trade.grossPnl += f.closedPnl;
        cur.trade.fees += f.fee * ratio;
        cur.trade.fillCount++;
        cur.trade.status = "closed";
        cur.trade.closedAt = f.time;
        trades.push(finish(cur));

        cur = start(coin, dirOf(after), f, false);
        cur.entryNotional += f.px * openSz;
        cur.entrySz += openSz;
        cur.trade.maxSize = openSz;
        cur.trade.fees += f.fee * (1 - ratio);
        cur.trade.fillCount++;
      } else {
        if (!cur) {
          if (sa === 0) {
            pos = after;
            continue; // dust fill that opens and closes nothing
          }
          cur = start(coin, dirOf(after), f, false);
        }
        if (Math.abs(after) > Math.abs(before)) {
          cur.entryNotional += f.px * f.sz;
          cur.entrySz += f.sz;
        } else {
          cur.exitNotional += f.px * f.sz;
          cur.exitSz += f.sz;
        }
        cur.trade.grossPnl += f.closedPnl;
        cur.trade.fees += f.fee;
        cur.trade.fillCount++;
        cur.trade.maxSize = Math.max(cur.trade.maxSize, Math.abs(after));
        if (sa === 0) {
          cur.trade.status = "closed";
          cur.trade.closedAt = f.time;
          trades.push(finish(cur));
          cur = null;
        }
      }
      pos = after;
    }
    if (cur) trades.push(finish(cur));
  }

  attributeFunding(trades, funding);
  return trades.sort((a, b) => a.openedAt - b.openedAt || a.coin.localeCompare(b.coin));
}

/** Funding is charged hourly; give each payment to the trade open on that coin at that moment. */
function attributeFunding(trades: Trade[], funding: FundingEvent[]) {
  const byCoin = new Map<string, Trade[]>();
  for (const t of trades) {
    const list = byCoin.get(t.coin) ?? [];
    list.push(t);
    byCoin.set(t.coin, list);
  }
  for (const list of byCoin.values()) list.sort((a, b) => a.openedAt - b.openedAt);

  for (const f of funding) {
    const list = byCoin.get(f.coin);
    if (!list) continue;
    const t = list.find((x) => x.openedAt <= f.time && f.time <= (x.closedAt ?? Infinity));
    if (!t) continue;
    t.funding += f.usdc;
    t.netPnl = t.grossPnl - t.fees + t.funding;
  }
}
