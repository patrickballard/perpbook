import type {
  Fill,
  FundingEvent,
  HlClearinghouseState,
  HlFill,
  HlFunding,
  HlPortfolio,
  OpenPosition,
} from "./types";

const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};

const PERP_DIRS = new Set([
  "Open Long",
  "Close Long",
  "Open Short",
  "Close Short",
  "Long > Short",
  "Short > Long",
  "Liquidated Isolated Long",
  "Liquidated Isolated Short",
  "Liquidated Cross Long",
  "Liquidated Cross Short",
  "Auto-Deleveraging",
]);

/**
 * Spot fills use coins like "@107" or "PURR/USDC" and dirs "Buy"/"Sell".
 * Builder-deployed perps (HIP-3) look like "xyz:TSLA" and are kept.
 */
export function isPerpFill(f: HlFill): boolean {
  if (f.coin.startsWith("@") || f.coin.includes("/")) return false;
  if (PERP_DIRS.has(f.dir)) return true;
  // Unknown dir strings: keep if a position size was recorded.
  return f.dir !== "Buy" && f.dir !== "Sell";
}

export const fillId = (f: Pick<HlFill, "tid" | "hash">) => `${f.tid}-${f.hash}`;
export const fundingId = (f: HlFunding) => `${f.hash}-${f.time}-${f.delta?.coin}`;

export function normaliseFills(raw: HlFill[]): Fill[] {
  const seen = new Set<string>();
  const out: Fill[] = [];
  for (const f of raw) {
    if (!isPerpFill(f)) continue;
    const id = fillId(f);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      coin: f.coin,
      px: num(f.px),
      sz: num(f.sz),
      side: f.side === "B" ? "buy" : "sell",
      time: f.time,
      startPosition: num(f.startPosition),
      closedPnl: num(f.closedPnl),
      fee: num(f.fee),
    });
  }
  return out.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function normaliseFunding(raw: HlFunding[]): FundingEvent[] {
  const seen = new Set<string>();
  const out: FundingEvent[] = [];
  for (const f of raw) {
    if (f?.delta?.type !== "funding") continue;
    const id = fundingId(f);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, coin: f.delta.coin, usdc: num(f.delta.usdc), time: f.time });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Positions across every perp dex's clearinghouse state (one per dex, HIP-3 included). */
export function normalisePositions(states: (HlClearinghouseState | null)[]): {
  accountValue: number | null;
  positions: OpenPosition[];
} {
  const chs = states.filter((c): c is HlClearinghouseState => c != null);
  if (!chs.length) return { accountValue: null, positions: [] };
  const positions = chs
    .flatMap((ch) => ch.assetPositions ?? [])
    .map((a) => a.position)
    .filter((p) => num(p.szi) !== 0)
    .map((p) => ({
      coin: p.coin,
      size: num(p.szi),
      notional: Math.abs(num(p.positionValue)),
      entryPx: p.entryPx == null ? null : num(p.entryPx),
      unrealizedPnl: num(p.unrealizedPnl),
      liquidationPx: p.liquidationPx == null ? null : num(p.liquidationPx),
      leverage: p.leverage?.value ?? null,
    }));
  return { accountValue: chs.reduce((sum, ch) => sum + num(ch.marginSummary?.accountValue), 0), positions };
}

/** Hyperliquid's all-time perps PnL (realised + unrealised, after fees and funding), or null. */
export function allTimePerpPnl(p: HlPortfolio | null): number | null {
  const series = p?.find(([period]) => period === "perpAllTime")?.[1].pnlHistory;
  const last = series?.at(-1);
  return last ? num(last[1]) : null;
}
