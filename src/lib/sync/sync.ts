import type { Db } from "../db/db";
import { countFills, failSync, finishSync, getWallet, insertFills, insertFunding, recordGap, type Gap } from "../db/store";
import type { HyperliquidClient } from "../hyperliquid/client";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Sync often enough that half of Hyperliquid's 10,000-fill window never fills up between syncs. */
const TARGET_FILLS_BETWEEN_SYNCS = 5_000;
const MIN_INTERVAL = 10 * MIN;
const MAX_INTERVAL = 6 * HOUR;
const IDLE_INTERVAL = DAY;
const IDLE_AFTER = 30 * DAY;

export function nextInterval(fillsPerHour: number, idle: boolean): number {
  if (idle) return IDLE_INTERVAL;
  if (fillsPerHour <= 0) return MAX_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, (TARGET_FILLS_BETWEEN_SYNCS / fillsPerHour) * HOUR));
}

/**
 * Stored fills per wallet. Some whales have millions of fills (James Wynn made 300,000+ in two
 * weeks); saving them all would fill a free 0.5 GB database by itself.
 */
export const maxStoredFills = () => Number(process.env.MAX_FILLS_PER_WALLET ?? 50_000);
const FILLS_PER_PAGE = 2_000; // Hyperliquid's page size for userFillsByTime

export const TOO_MANY_FILLS = "This wallet has more fills than perpbook saves per wallet";

export type SyncResult = { newFills: number; newFunding: number; gap: Gap | null; nextSyncAt: number; complete: boolean; capped?: boolean };

/**
 * Bring one tracked wallet up to date. Fetches from the last stored timestamp
 * inclusive, so the first rows back should be ones we already have; if they
 * aren't, Hyperliquid's window has moved past us and we record a gap. The
 * engine stays correct either way (its startPosition check marks the trade
 * partial); the gap row lets the dashboard say which dates are missing.
 */
export async function syncWallet(db: Db, client: HyperliquidClient, address: string, now = Date.now(), cap = maxStoredFills()): Promise<SyncResult> {
  const w = await getWallet(db, address);
  if (!w) throw new Error(`${address} is not tracked`);

  // Stop at the per-wallet cap and check back daily, rather than filling the database.
  const room = cap - (await countFills(db, address));
  if (room <= 0) {
    await failSync(db, address, `${TOO_MANY_FILLS} (${cap.toLocaleString("en-GB")}).`, now + DAY);
    return { newFills: 0, newFunding: 0, gap: null, nextSyncAt: now + DAY, complete: false, capped: true };
  }

  const fillsPage = await client.fills(address, w.lastFillTime ?? 0, Math.min(60, Math.ceil(room / FILLS_PER_PAGE)));
  const fills = fillsPage.rows;
  const firstFillTime = fills[0]?.time ?? null;
  const gap =
    w.lastFillTime != null && firstFillTime != null && firstFillTime > w.lastFillTime
      ? { fromTime: w.lastFillTime, toTime: firstFillTime }
      : null;

  // Funding before the oldest fill we have can't be matched to a trade, so don't start earlier.
  const fundingFrom = w.lastFundingTime ?? w.lastFillTime ?? firstFillTime;
  const fundingPage = fundingFrom == null ? { rows: [], complete: true } : await client.funding(address, fundingFrom);
  const funding = fundingPage.rows;
  // Stopped at the page limit: there's more history to fetch, so come back soon rather than on the usual schedule.
  const complete = fillsPage.complete && fundingPage.complete;

  return db.transaction(async (tx) => {
    const newFills = await insertFills(tx, address, fills);
    const newFunding = await insertFunding(tx, address, funding);
    if (gap) await recordGap(tx, address, gap);

    const lastFillTime = fills.length ? Math.max(w.lastFillTime ?? 0, fills.at(-1)!.time) : w.lastFillTime;
    const lastFundingTime = funding.length ? Math.max(w.lastFundingTime ?? 0, funding.at(-1)!.time) : w.lastFundingTime;

    // Fill rate over the window this sync covered, smoothed so one burst doesn't swing the schedule.
    const since = w.lastSyncedAt ?? firstFillTime ?? now;
    const hours = Math.max((now - since) / HOUR, 1 / 60);
    const rate = newFills / hours;
    const fillsPerHour = w.lastSyncedAt == null ? rate : 0.5 * w.fillsPerHour + 0.5 * rate;

    const lastActive = Math.max(lastFillTime ?? 0, w.lastViewedAt ?? 0, w.trackedSince);
    const nextSyncAt = now + (complete ? nextInterval(fillsPerHour, now - lastActive > IDLE_AFTER) : MIN_INTERVAL);

    await finishSync(tx, address, { lastFillTime, lastFundingTime, fillsPerHour, nextSyncAt, now });
    return { newFills, newFunding, gap, nextSyncAt, complete };
  });
}

/**
 * How long the worker should sleep when nothing is due. Waking only when the next wallet
 * is due lets a scale-to-zero database (Neon) suspend between syncs; checking every few
 * seconds would keep it awake around the clock. The cap bounds how long a newly saved
 * wallet waits for its first sync, which costs nothing: the dashboard shows live data
 * until then.
 */
export const IDLE_WAIT_MAX = 10 * MIN;
export function idleWait(nextDue: number | null, now: number): number {
  if (nextDue == null) return IDLE_WAIT_MAX;
  return Math.min(IDLE_WAIT_MAX, Math.max(1_000, nextDue - now));
}
