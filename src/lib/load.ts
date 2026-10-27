// Loading a wallet straight from Hyperliquid in the browser, kept out of the React hook so it
// can be tested against the fake Hyperliquid. Two things make it feel fast:
//  - the dashboard can render as soon as fills are in; funding (most of the requests for an
//    active trader) loads afterwards;
//  - a copy in the browser means repeat visits fetch only what's new, all in one round of requests.

import type { HyperliquidClient } from "./hyperliquid/client";
import { allTimePerpPnl, normaliseFills, normaliseFunding, normalisePositions, perpHistoryStart } from "./hyperliquid/normalise";
import type { Fill, FundingEvent } from "./hyperliquid/types";
import { lastTime, mergeById } from "./history";
import { shareStats } from "./share";
import { readCache, writeCache, type CacheStore } from "./walletCache";

/**
 * Positions on every dex and Hyperliquid's own PnL, fetched together so they describe the same
 * moment and can be reconciled; fetched alongside the latest fills, they're within a second of them.
 */
export async function liveState(client: HyperliquidClient, address: string) {
  const [chs, portfolio] = await Promise.all([client.allClearinghouses(address).catch(() => null), client.portfolio(address).catch(() => null)]);
  return {
    ...normalisePositions(chs ?? []),
    // Without positions, unrealised PnL is unknown and the check would wrongly say "doesn't match".
    hyperliquidPnl: chs ? allTimePerpPnl(portfolio) : null,
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
  const done = async (fills: Fill[], funding: FundingEvent[], rawFillCount: number, complete: boolean, live: LiveState): Promise<Loaded> => {
    if (complete && fills.length) await writeCache(o.cache ?? null, address, fills, funding);
    return { fills, funding, rawFillCount, complete, fundingPending: false, live };
  };

  if (cached) {
    // Repeat visit: we know where both histories end, so fetch what's new and the live state
    // together, starting at the last row we have so the overlap dedupes. One round of requests.
    o.progress?.("Checking for new trades…");
    const [page, fundingPage, live] = await Promise.all([
      client.fills(address, lastTime(cached.fills) ?? 0, o.fillPages, say("new fills from Hyperliquid")),
      client.funding(address, lastTime(cached.funding) ?? cached.fills[0]?.time ?? 0, o.fundingPages),
      liveState(client, address),
    ]);
    const fills = mergeById(cached.fills, normaliseFills(page.rows));
    if (!page.complete) return done(fills, [], page.rows.length, false, live);
    return done(fills, mergeById(cached.funding, normaliseFunding(fundingPage.rows)), page.rows.length, fundingPage.complete, live);
  }

  // First visit: fills first, so the dashboard can show before funding (most of the requests).
  const [page, early] = await Promise.all([client.fills(address, 0, o.fillPages, say("fills from Hyperliquid")), liveState(client, address)]);
  const fills = normaliseFills(page.rows);
  if (!page.complete) {
    // Too active to rebuild here; funding won't be shown, so don't fetch it.
    return done(fills, [], page.rows.length, false, early);
  }
  o.onFills?.({ fills, funding: [], rawFillCount: page.rows.length, complete: true, fundingPending: true, live: early });

  // Funding from before the oldest fill can't be matched to a trade, so start there.
  const fundingPage = await client.funding(address, fills[0]?.time ?? 0, o.fundingPages, say("funding payments"));

  // Fresh positions and totals, so the check against Hyperliquid compares the same moment.
  o.progress?.("Checking positions and totals against Hyperliquid…");
  const live = await liveState(client, address);
  return done(fills, normaliseFunding(fundingPage.rows), page.rows.length, fundingPage.complete, live);
}
