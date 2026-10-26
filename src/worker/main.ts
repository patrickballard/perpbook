// The sync worker: keeps every tracked wallet's stored history up to date.
// Run one per IP address; Hyperliquid's rate budget is per IP.
//   npm run worker             run forever (a server)
//   npm run worker -- --once   sync what's due, then exit (a scheduled job, e.g. GitHub Actions)

import { serverDb } from "../lib/db/server";
import { migrate } from "../lib/db/migrations";
import { HyperliquidClient } from "../lib/hyperliquid/client";
import { budgetedFetch, WeightBudget } from "../lib/sync/budget";
import { runWorker } from "../lib/sync/worker";

const once = process.argv.includes("--once");
// GitHub sets GITHUB_ACTIONS; logs on a public repo are public, so keep wallet addresses out of them.
const perWalletLogs = process.env.GITHUB_ACTIONS !== "true";
// Stop claiming wallets in time for the job's own timeout; whatever is left waits for the next run.
const maxMs = Number(process.env.WORKER_MAX_MINUTES ?? 20) * 60_000;

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
  const weightPerMinute = Number(process.env.HL_WEIGHT_PER_MINUTE ?? 1_000);
  const client = new HyperliquidClient(budgetedFetch(new WeightBudget(weightPerMinute)));

  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.on(sig, () => {
      stopping = true;
      wake();
    });
  log("worker started", { once, weightPerMinute });

  const started = Date.now();
  const totals = await runWorker(db, client, { once, maxMs, perWalletLogs, log, sleep, stopped: () => stopping });
  log("worker stopped", { ...totals, ms: Date.now() - started });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
