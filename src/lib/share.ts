// Numbers for the share card shown when a wallet link is posted. They come from Hyperliquid's
// portfolio endpoint: one cheap request, unlike rebuilding every trade on the server.

import { demoAccount } from "./demo";
import { dailyPnl, dayKey } from "./engine/stats";
import { normaliseFills, normaliseFunding } from "./hyperliquid/normalise";
import type { HlPortfolio } from "./hyperliquid/types";

export type ShareStats = {
  /** All-time perps PnL, realised and unrealised, after fees and funding. */
  allTime: number;
  month: number | null;
  volume: number;
  /** Cumulative PnL over time, oldest first, for the sparkline. */
  series: number[];
};

export function shareStats(p: HlPortfolio | null): ShareStats | null {
  const period = (name: string) => p?.find(([n]) => n === name)?.[1];
  const all = period("perpAllTime");
  if (!all?.pnlHistory.length) return null;
  const series = all.pnlHistory.map(([, v]) => Number(v));
  const month = period("perpMonth")?.pnlHistory.at(-1);
  return { allTime: series.at(-1)!, month: month ? Number(month[1]) : null, volume: Number(all.vlm) || 0, series };
}

export function demoShareStats(now = Date.now()): ShareStats {
  const d = demoAccount(now);
  const fills = normaliseFills(d.fills);
  const days = dailyPnl(fills, normaliseFunding(d.funding), "UTC");
  let c = 0;
  const series = [0, ...days.map((x) => (c += x.net))];
  const monthStart = dayKey(now - 30 * 86_400_000, "UTC");
  const month = days.filter((x) => x.date > monthStart).reduce((s, x) => s + x.net, 0);
  return { allTime: c, month, volume: fills.reduce((s, f) => s + f.px * f.sz, 0), series };
}

/** SVG polyline points for `series` scaled into a w×h box. */
export function sparkline(series: number[], w: number, h: number): string {
  if (series.length < 2) return `0,${h / 2} ${w},${h / 2}`;
  const lo = Math.min(...series);
  const span = Math.max(...series) - lo || 1;
  return series.map((v, i) => `${((i / (series.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / span) * h).toFixed(1)}`).join(" ");
}

export function compactUsd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(1)}k`;
  return `$${a.toFixed(0)}`;
}
