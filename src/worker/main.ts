// The sync worker: keeps every tracked wallet's stored history up to date.
// Run one per IP address; Hyperliquid's rate budget is per IP. `npm run worker`.

import { serverDb } from "../lib/db/server";
import { migrate } from "../lib/db/migrations";
import { claimDueWallet, failSync, nextDueAt } from "../lib/db/store";
import { HyperliquidClient } from "../lib/hyperliquid/client";
import { budgetedFetch, WeightBudget } from "../lib/sync/budget";
import { idleWait, syncWallet } from "../lib/sync/sync";

const RETRY_AFTER_ERROR_MS = 15 * 60_000;

// Resolves early when the worker is told to stop, so shutdown doesn't wait out a long idle sleep.
let wake: () => void = () => {};
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    wake = () => {
      clearTimeout(t);
      r();
    };
  });
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
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      stopping = true;
      wake();
    });
  log("worker started", { weightPerMinute: Number(process.env.HL_WEIGHT_PER_MINUTE ?? 1_000) });

  while (!stopping) {
    const address = await claimDueWallet(db);
    if (!address) {
      await sleep(idleWait(await nextDueAt(db), Date.now()));
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
