import type { Db } from "../db/db";
import { finishSync, getWallet, insertFills, insertFunding, recordGap, type Gap } from "../db/store";
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

export type SyncResult = { newFills: number; newFunding: number; gap: Gap | null; nextSyncAt: number };

/**
 * Bring one tracked wallet up to date. Fetches from the last stored timestamp
 * inclusive, so the first rows back should be ones we already have; if they
 * aren't, Hyperliquid's window has moved past us and we record a gap. The
 * engine stays correct either way (its startPosition check marks the trade
 * partial); the gap row lets the dashboard say which dates are missing.
 */
export async function syncWallet(db: Db, client: HyperliquidClient, address: string, now = Date.now()): Promise<SyncResult> {
  const w = await getWallet(db, address);
  if (!w) throw new Error(`${address} is not tracked`);

  const fills = await client.fills(address, w.lastFillTime ?? 0);
  const firstFillTime = fills[0]?.time ?? null;
  const gap =
    w.lastFillTime != null && firstFillTime != null && firstFillTime > w.lastFillTime
      ? { fromTime: w.lastFillTime, toTime: firstFillTime }
      : null;

  // Funding before the oldest fill we have can't be matched to a trade, so don't start earlier.
  const fundingFrom = w.lastFundingTime ?? w.lastFillTime ?? firstFillTime;
  const funding = fundingFrom == null ? [] : await client.funding(address, fundingFrom);

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
    const nextSyncAt = now + nextInterval(fillsPerHour, now - lastActive > IDLE_AFTER);

    await finishSync(tx, address, { lastFillTime, lastFundingTime, fillsPerHour, nextSyncAt, now });
    return { newFills, newFunding, gap, nextSyncAt };
  });
}
