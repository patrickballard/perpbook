// Freeze a league week's final table: prints a `final:` entry to paste into its season in
// src/lib/league/seasons.ts. Run after the week ends (Sunday 20:00 UK) and before Hyperliquid's
// weekly history stops reaching back to its Monday (about a day later).
//   npm run league-final            the current season
//   npm run league-final -- 1       season "1"

import { HyperliquidClient } from "../lib/hyperliquid/client";
import { budgetedFetch, WeightBudget } from "../lib/sync/budget";
import { currentSeason, SEASONS } from "../lib/league/seasons";
import { rank, standings, weeklyHistoryCovers } from "../lib/league/standings";

async function main() {
  const slug = process.argv[2];
  const season = slug ? SEASONS.find((s) => s.slug === slug) : currentSeason();
  if (!season) throw new Error(`No season "${slug}"`);
  const now = Date.now();
  if (now < season.end) throw new Error(`${season.name} hasn't ended yet`);
  if (!weeklyHistoryCovers(season.start, now)) console.warn("Hyperliquid's weekly history no longer reaches the start: numbers come from the coarser monthly history.");
  // Unhurried: full retries and no deadline, so nobody is left out.
  const rows = await standings(season, new HyperliquidClient(budgetedFetch(new WeightBudget(1_000))), now);
  const { ranked, sittingOut, failed } = rank(rows);
  if (failed.length) throw new Error(`Hyperliquid didn't answer for ${failed.map((s) => s.handle).join(", ")}; run it again.`);
  const round = (x: number) => Math.round(x * 100) / 100;
  const frozen = [...ranked, ...sittingOut].map((s) => ({ ...s, pnl: round(s.pnl), base: round(s.base), ret: s.ret == null ? null : Math.round(s.ret * 1e6) / 1e6 }));
  console.log(`    final: ${JSON.stringify(frozen, null, 2).replace(/\n/g, "\n    ")},`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
