// Remove saved wallets that reached the per-wallet fill cap: their pages show Hyperliquid's own
// totals, so their stored fills are never used. Prints counts and sizes only (Actions logs are public).
//   npm run prune -- --dry-run   count them
//   npm run prune                remove them

import { serverDb } from "../lib/db/server";
import { databaseBytes, pruneCappedWallets } from "../lib/db/store";

const dryRun = process.argv.includes("--dry-run");
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const db = serverDb();
  if (!db) throw new Error("DATABASE_URL is not set");
  const before = await databaseBytes(db);
  const r = await pruneCappedWallets(db, dryRun);
  console.log(`${dryRun ? "Would remove" : "Removed"} ${r.wallets} capped wallet(s) and ${r.fills.toLocaleString("en-GB")} stored fills. Database: ${mb(before)}.`);
  if (!dryRun && r.wallets) {
    // Deleted rows only free space for reuse; rewrite the tables so the database (and its free-tier usage) shrinks.
    await db.query("vacuum full fills, funding, history_gaps");
    console.log(`Database now ${mb(await databaseBytes(db))}.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
