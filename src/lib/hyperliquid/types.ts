// Shapes returned by Hyperliquid's public info endpoint (https://api.hyperliquid.xyz/info).
// Numbers arrive as strings; we parse them at the edge.

export type HlFill = {
  coin: string;
  px: string;
  sz: string;
  side: "B" | "A"; // B = bid (buy), A = ask (sell)
  time: number;
  startPosition: string; // signed position size before this fill
  dir: string; // "Open Long", "Close Short", "Long > Short", "Buy" (spot) ...
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken?: string;
  /** Total fee includes this; present only when a builder (front-end) fee was charged. */
  builderFee?: string;
  /** Present when the fill was a liquidation of this user; its closedPnl carries the loss. */
  liquidation?: { liquidatedUser: string; markPx: string; method: "market" | "backstop" };
  /** Set on fills from a TWAP order's slices. */
  twapId?: number | null;
};

export type HlFunding = {
  time: number;
  hash: string;
  delta: {
    type: "funding";
    coin: string;
    usdc: string; // negative = paid, positive = received
    szi: string;
    fundingRate: string;
  };
};

export type HlPosition = {
  coin: string;
  szi: string;
  entryPx: string | null;
  positionValue: string;
  unrealizedPnl: string;
  liquidationPx: string | null;
  leverage?: { type: string; value: number };
};

export type HlClearinghouseState = {
  marginSummary: { accountValue: string };
  assetPositions: { position: HlPosition }[];
};

type HlSeries = [time: number, value: string][];

/** Periods are day, week, month, allTime, and the same prefixed "perp" for perps only. */
export type HlPortfolio = [period: string, { accountValueHistory: HlSeries; pnlHistory: HlSeries; vlm: string }][];

/** Normalised fill used by the engine. */
export type Fill = {
  id: string;
  coin: string;
  px: number;
  sz: number;
  side: "buy" | "sell";
  time: number;
  startPosition: number;
  closedPnl: number;
  fee: number;
};

export type FundingEvent = {
  id: string;
  coin: string;
  usdc: number;
  time: number;
};

export type OpenPosition = {
  coin: string;
  size: number; // signed
  notional: number; // position value in USD at the current mark
  entryPx: number | null;
  unrealizedPnl: number;
  liquidationPx: number | null;
  leverage: number | null;
};
