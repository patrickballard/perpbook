// The sync worker's loop, kept apart from process wiring so it can be tested on PGlite.

import type { Db } from "../db/db";
import { claimDueWallet, failSync, nextDueAt } from "../db/store";
import type { HyperliquidClient } from "../hyperliquid/client";
import { idleWait, syncWallet } from "./sync";

const RETRY_AFTER_ERROR_MS = 15 * 60_000;

export type WorkerOptions = {
  /** Sync whatever is due, then return, instead of running forever (for scheduled jobs). */
  once?: boolean;
  /** In once mode, stop claiming wallets after this long; the rest wait for the next run. */
  maxMs?: number;
  /** Log a line per wallet. Off where logs are public, so they don't list who uses perpbook. */
  perWalletLogs?: boolean;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
  stopped?: () => boolean;
  now?: () => number;
};

export type WorkerTotals = { synced: number; failed: number; newFills: number; newFunding: number; gaps: number };

export async function runWorker(db: Db, client: HyperliquidClient, o: WorkerOptions = {}): Promise<WorkerTotals> {
  const { once = false, maxMs = Infinity, perWalletLogs = true, log = () => {}, stopped = () => false, now = Date.now } = o;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const totals: WorkerTotals = { synced: 0, failed: 0, newFills: 0, newFunding: 0, gaps: 0 };
  const started = now();

  while (!stopped() && !(once && now() - started > maxMs)) {
    const address = await claimDueWallet(db, now());
    if (!address) {
      if (once) break;
      await sleep(idleWait(await nextDueAt(db), now()));
      continue;
    }
    const t0 = now();
    try {
      const r = await syncWallet(db, client, address, now());
      totals.synced++;
      totals.newFills += r.newFills;
      totals.newFunding += r.newFunding;
      if (r.gap) totals.gaps++;
      if (perWalletLogs) log("synced", { address, ...r, ms: now() - t0 });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await failSync(db, address, error, now() + RETRY_AFTER_ERROR_MS);
      totals.failed++;
      if (perWalletLogs) log("sync failed", { address, error });
      else log("sync failed", { error });
    }
  }
  return totals;
}
