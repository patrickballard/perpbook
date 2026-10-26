"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HyperliquidClient } from "./hyperliquid/client";
import { budgetedFetch, WeightBudget } from "./sync/budget";
import { normaliseFills, normaliseFunding, normalisePositions } from "./hyperliquid/normalise";
import type { Fill, FundingEvent, OpenPosition } from "./hyperliquid/types";
import { buildTrades } from "./engine/trades";
import { dailyPnl, equityCurve, greenStreak, reconcile, tradeStats } from "./engine/stats";
import { demoAccount } from "./demo";
import type { ShareStats } from "./share";
import { getStorage, getStoredHistory, lastTime, mergeById, requestTracking, type Storage } from "./history";
import { liveState, loadFromHyperliquid } from "./load";
import { browserStore } from "./walletCache";

export type WalletStatus = "idle" | "loading" | "ready" | "error";

type Raw = {
  fills: Fill[];
  funding: FundingEvent[];
  positions: OpenPosition[];
  accountValue: number | null;
  /** Hyperliquid's own all-time perps PnL, to check ours against. */
  hyperliquidPnl: number | null;
  /** When Hyperliquid's PnL record starts, to tell whether we have the account's whole history. */
  hyperliquidSince: number | null;
  syncedAt: number;
  /** Fills Hyperliquid returned in this load. */
  rawFillCount: number;
  storage: Storage;
  /**
   * Whether we have every fill and funding payment. Very active wallets have more than the
   * browser loads; rebuilt numbers for them would be wrong, so the dashboard shows
   * Hyperliquid's own totals (summary) instead.
   */
  complete: boolean;
  /** Fills are in but funding is still loading, so totals that include funding aren't final. */
  fundingPending: boolean;
  summary: ShareStats | null;
};

// How much the browser loads from Hyperliquid before calling a wallet too big: 20,000 fills and
// 20,000 funding payments (a trader with ~50 positions open pays about 1,200 a day), together at
// most about 3 minutes of rate budget.
const FILL_PAGES = 10;
const FUNDING_PAGES = 40;

// Pace requests under Hyperliquid's per-IP limit (1,200 weight a minute) instead of bursting
// past it: a long-lived wallet's first load needs more than a minute's budget, and bursting
// ended in 429s and a failed sync. Paced, a big wallet loads slowly but always loads.
const client = new HyperliquidClient(budgetedFetch(new WeightBudget(1_000)));

export function useWallet(address: string) {
  const demo = address === "demo";
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<Raw | null>(null);
  // What's loading right now, for wallets that take a while ("Loading fills from Hyperliquid: 8,000 so far…").
  const [progress, setProgress] = useState<string | null>(null);

  // Each sync gets a number; results from an older one (e.g. still loading funding when the
  // visitor clicks Refresh) are dropped instead of overwriting newer ones.
  const generation = useRef(0);

  const sync = useCallback(async () => {
    const me = ++generation.current;
    const current = () => generation.current === me;
    const show = (r: Raw) => current() && setRaw(r);
    const note = (m: string | null) => current() && setProgress(m);
    setStatus("loading");
    setError(null);
    setProgress(null);
    const loading = (what: string) => (n: number) => note(`Loading ${what}: ${n.toLocaleString("en-GB")} so far…`);
    try {
      if (demo) {
        const d = demoAccount();
        const live = { ...normalisePositions([d.clearinghouse]), hyperliquidPnl: null, hyperliquidSince: null, summary: null };
        show({
          fills: normaliseFills(d.fills),
          funding: normaliseFunding(d.funding),
          ...live,
          syncedAt: Date.now(),
          rawFillCount: d.fills.length,
          storage: { state: "off" },
          complete: true,
          fundingPending: false,
        });
      } else {
        const storage = await getStorage(address);
        if (storage.state === "tracked") {
          // Saved history from perpbook, then only what's newer straight from Hyperliquid.
          const stored = await getStoredHistory(address, fetch, loading("your saved history"));
          const since = lastTime(stored.fills);
          const [fills, funding, live] = await Promise.all([
            client.fills(address, since ?? 0, FILL_PAGES, loading("new fills from Hyperliquid")),
            client.funding(address, lastTime(stored.funding) ?? since ?? 0, FUNDING_PAGES),
            liveState(client, address),
          ]);
          show({
            fills: mergeById(stored.fills, normaliseFills(fills.rows)),
            funding: mergeById(stored.funding, normaliseFunding(funding.rows)),
            ...live,
            syncedAt: Date.now(),
            rawFillCount: fills.rows.length,
            storage,
            complete: stored.complete && fills.complete && funding.complete,
            fundingPending: false,
          });
        } else {
          // Straight from Hyperliquid, using the copy in this browser from earlier visits, and
          // showing the dashboard as soon as the fills are in.
          const toRaw = (l: Awaited<ReturnType<typeof loadFromHyperliquid>>): Raw => ({
            fills: l.fills,
            funding: l.funding,
            ...l.live,
            syncedAt: Date.now(),
            rawFillCount: l.rawFillCount,
            storage,
            complete: l.complete,
            fundingPending: l.fundingPending,
          });
          const loaded = await loadFromHyperliquid(client, address, {
            fillPages: FILL_PAGES,
            fundingPages: FUNDING_PAGES,
            cache: browserStore(),
            progress: note,
            onFills: (partial) => show(toRaw(partial)),
          });
          show(toRaw(loaded));
        }
      }
      if (current()) setStatus("ready");
    } catch (e) {
      if (!current()) return;
      setError(e instanceof Error ? e.message : "Sync failed");
      setStatus("error");
    } finally {
      note(null);
    }
  }, [address, demo]);

  useEffect(() => {
    // Loading the wallet when the page opens (or the address changes) is syncing with an external
    // system, which is what effects are for; sync() marks the page as loading before it awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void sync();
  }, [sync]);

  const [trackError, setTrackError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const track = useCallback(async () => {
    setTracking(true);
    setTrackError(null);
    const err = await requestTracking(address);
    if (err) setTrackError(err);
    else await sync(); // stay "Saving…" until the dashboard knows the wallet is tracked
    setTracking(false);
  }, [address, sync]);

  const derived = useMemo(() => {
    if (!raw) return null;
    const trades = buildTrades(raw.fills, raw.funding);
    const days = dailyPnl(raw.fills, raw.funding);
    return {
      trades,
      stats: tradeStats(trades),
      days,
      equity: equityCurve(days),
      streak: greenStreak(days),
      reconciliation: reconcile(days, raw.positions, raw.hyperliquidPnl),
    };
  }, [raw]);

  return { status, error, raw, derived, sync, demo, track, tracking, trackError, progress };
}
