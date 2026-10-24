// The sync worker: keeps every tracked wallet's stored history up to date.
// Run one per IP address; Hyperliquid's rate budget is per IP. `npm run worker`.

import { serverDb } from "../lib/db/server";
import { migrate } from "../lib/db/migrations";
import { claimDueWallet, failSync } from "../lib/db/store";
import { HyperliquidClient } from "../lib/hyperliquid/client";
import { budgetedFetch, WeightBudget } from "../lib/sync/budget";
import { syncWallet } from "../lib/sync/sync";

const IDLE_POLL_MS = 5_000;
const RETRY_AFTER_ERROR_MS = 15 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));

async function main() {
  const db = serverDb();
  if (!db) throw new Error("DATABASE_URL is not set");
  const applied = await migrate(db);
  if (applied) log("migrated", { applied });

  // Leave headroom under Hyperliquid's 1,200 for anything else sharing this IP.
  const budget = new WeightBudget(Number(process.env.HL_WEIGHT_PER_MINUTE ?? 1_000));
  const client = new HyperliquidClient(budgetedFetch(budget));

  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));
  log("worker started", { weightPerMinute: Number(process.env.HL_WEIGHT_PER_MINUTE ?? 1_000) });

  while (!stopping) {
    const address = await claimDueWallet(db);
    if (!address) {
      await sleep(IDLE_POLL_MS);
      continue;
    }
    const started = Date.now();
    try {
      const r = await syncWallet(db, client, address);
      log("synced", { address, ...r, ms: Date.now() - started });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await failSync(db, address, error, Date.now() + RETRY_AFTER_ERROR_MS);
      log("sync failed", { address, error });
    }
  }
  log("worker stopped");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
