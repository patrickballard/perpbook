"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HyperliquidClient } from "./hyperliquid/client";
import { allTimePerpPnl, normaliseFills, normaliseFunding, normalisePositions } from "./hyperliquid/normalise";
import type { Fill, FundingEvent, OpenPosition } from "./hyperliquid/types";
import { buildTrades } from "./engine/trades";
import { dailyPnl, equityCurve, greenStreak, reconcile, tradeStats } from "./engine/stats";
import { demoAccount } from "./demo";
import { getStorage, getStoredHistory, lastTime, mergeById, requestTracking, type Storage } from "./history";

export type WalletStatus = "idle" | "loading" | "ready" | "error";

type Raw = {
  fills: Fill[];
  funding: FundingEvent[];
  positions: OpenPosition[];
  accountValue: number | null;
  /** Hyperliquid's own all-time perps PnL, to check ours against. */
  hyperliquidPnl: number | null;
  syncedAt: number;
  /** Fills Hyperliquid returned; near 10,000 means older ones are dropping off. */
  rawFillCount: number;
  storage: Storage;
};

const client = new HyperliquidClient();

/**
 * Positions on every dex and Hyperliquid's own PnL, fetched together after the fills so
 * all three describe nearly the same moment and can be reconciled.
 */
async function liveState(address: string) {
  const [chs, portfolio] = await Promise.all([
    client.allClearinghouses(address).catch(() => []),
    client.portfolio(address).catch(() => null),
  ]);
  return { ...normalisePositions(chs), hyperliquidPnl: allTimePerpPnl(portfolio) };
}

export function useWallet(address: string) {
  const demo = address === "demo";
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<Raw | null>(null);

  const sync = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      if (demo) {
        const d = demoAccount();
        const live = { ...normalisePositions([d.clearinghouse]), hyperliquidPnl: null };
        setRaw({
          fills: normaliseFills(d.fills),
          funding: normaliseFunding(d.funding),
          ...live,
          syncedAt: Date.now(),
          rawFillCount: d.fills.length,
          storage: { state: "off" },
        });
      } else {
        const storage = await getStorage(address);
        if (storage.state === "tracked") {
          // Saved history from perpbook, then only what's newer straight from Hyperliquid.
          const stored = await getStoredHistory(address);
          const since = lastTime(stored.fills);
          const [fills, funding] = await Promise.all([
            client.fills(address, since ?? 0),
            client.funding(address, lastTime(stored.funding) ?? since ?? 0),
          ]);
          const live = await liveState(address);
          setRaw({
            fills: mergeById(stored.fills, normaliseFills(fills)),
            funding: mergeById(stored.funding, normaliseFunding(funding)),
            ...live,
            syncedAt: Date.now(),
            rawFillCount: fills.length,
            storage,
          });
        } else {
          const [fills, funding] = await Promise.all([client.fills(address), client.funding(address)]);
          const live = await liveState(address);
          setRaw({
            fills: normaliseFills(fills),
            funding: normaliseFunding(funding),
            ...live,
            syncedAt: Date.now(),
            rawFillCount: fills.length,
            storage,
          });
        }
      }
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      setStatus("error");
    }
  }, [address, demo]);

  useEffect(() => {
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

  return { status, error, raw, derived, sync, demo, track, tracking, trackError };
}
