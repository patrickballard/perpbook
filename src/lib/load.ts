// Loading a wallet straight from Hyperliquid in the browser, kept out of the React hook so it
// can be tested against the fake Hyperliquid. Two things make it feel fast:
//  - the dashboard can render as soon as fills are in; funding (most of the requests for an
//    active trader) loads afterwards;
//  - a copy in the browser means repeat visits fetch only what's new.

import type { HyperliquidClient } from "./hyperliquid/client";
import { allTimePerpPnl, normaliseFills, normaliseFunding, normalisePositions, perpHistoryStart } from "./hyperliquid/normalise";
import type { Fill, FundingEvent } from "./hyperliquid/types";
import { lastTime, mergeById } from "./history";
import { shareStats } from "./share";
import { readCache, writeCache, type CacheStore } from "./walletCache";

/**
 * Positions on every dex and Hyperliquid's own PnL, fetched together after the fills so
 * they describe nearly the same moment and can be reconciled.
 */
export async function liveState(client: HyperliquidClient, address: string) {
  const [chs, portfolio] = await Promise.all([client.allClearinghouses(address).catch(() => []), client.portfolio(address).catch(() => null)]);
  return {
    ...normalisePositions(chs),
    hyperliquidPnl: allTimePerpPnl(portfolio),
    hyperliquidSince: perpHistoryStart(portfolio),
    summary: shareStats(portfolio),
  };
}
export type LiveState = Awaited<ReturnType<typeof liveState>>;

export type Loaded = {
  fills: Fill[];
  funding: FundingEvent[];
  /** Raw fills Hyperliquid returned this time, spot included. */
  rawFillCount: number;
  /** Whether every fill and funding payment is here (false: too active to load in a browser). */
  complete: boolean;
  /** Funding still to come: totals that include funding aren't final yet. */
  fundingPending: boolean;
  live: LiveState;
};

export async function loadFromHyperliquid(
  client: HyperliquidClient,
  address: string,
  o: {
    fillPages: number;
    fundingPages: number;
    cache?: CacheStore | null;
    progress?: (message: string) => void;
    /** Called once the fills are in, before funding loads, so the dashboard can show early. */
    onFills?: (partial: Loaded) => void;
  },
): Promise<Loaded> {
  const say = (what: string) => (n: number) => o.progress?.(`Loading ${what}: ${n.toLocaleString("en-GB")} so far…`);
  const cached = await readCache(o.cache ?? null, address);

  // Only what's newer than the copy we have, starting at its last fill so the overlap dedupes.
  const page = await client.fills(address, lastTime(cached?.fills ?? []) ?? 0, o.fillPages, say(cached ? "new fills from Hyperliquid" : "fills from Hyperliquid"));
  const fills = mergeById(cached?.fills ?? [], normaliseFills(page.rows));

  o.progress?.("Checking positions and totals against Hyperliquid…");
  const early = await liveState(client, address);
  if (!page.complete) {
    // Too active to rebuild here; funding won't be shown, so don't fetch it.
    return { fills, funding: [], rawFillCount: page.rows.length, complete: false, fundingPending: false, live: early };
  }
  o.onFills?.({ fills, funding: cached?.funding ?? [], rawFillCount: page.rows.length, complete: true, fundingPending: true, live: early });

  // Funding from before the oldest fill can't be matched to a trade, so start there at the earliest.
  const from = lastTime(cached?.funding ?? []) ?? fills[0]?.time ?? 0;
  const fundingPage = await client.funding(address, from, o.fundingPages, say("funding payments"));
  const funding = mergeById(cached?.funding ?? [], normaliseFunding(fundingPage.rows));

  // Fresh positions and totals, so the check against Hyperliquid compares the same moment.
  o.progress?.("Checking positions and totals against Hyperliquid…");
  const live = await liveState(client, address);
  if (fundingPage.complete && fills.length) await writeCache(o.cache ?? null, address, fills, funding);
  return { fills, funding, rawFillCount: page.rows.length, complete: fundingPage.complete, fundingPending: false, live };
}
