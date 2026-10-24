import { HyperliquidClient } from "../hyperliquid/client";
import type { HlFill, HlFunding } from "../hyperliquid/types";

/**
 * An in-memory stand-in for Hyperliquid's info endpoint that behaves like the real one
 * where it matters: pages come back oldest first from `startTime`, are capped in size,
 * and only the most recent `window` fills exist at all.
 */
export class FakeHyperliquid {
  fills: HlFill[] = [];
  funding: HlFunding[] = [];
  requests: string[] = [];
  private tid = 0;
  private pos = 0;

  constructor(
    private readonly window = 10_000,
    private readonly pageSize = 2_000,
  ) {}

  /** Trade on one coin, keeping startPosition consistent like Hyperliquid does. */
  trade(time: number, side: "buy" | "sell", sz: number, px = 100, coin = "BTC"): HlFill {
    const f: HlFill = {
      coin,
      px: String(px),
      sz: String(sz),
      side: side === "buy" ? "B" : "A",
      time,
      startPosition: String(this.pos),
      dir: side === "buy" ? "Open Long" : "Close Long",
      closedPnl: "0",
      hash: `0x${(++this.tid).toString(16)}`,
      oid: this.tid,
      crossed: true,
      fee: "0.01",
      tid: this.tid,
    };
    this.pos += side === "buy" ? sz : -sz;
    this.fills.push(f);
    return f;
  }

  pay(time: number, usdc: number, coin = "BTC") {
    this.funding.push({ time, hash: "0x0", delta: { type: "funding", coin, usdc: String(usdc), szi: "1", fundingRate: "0.0001" } });
  }

  readonly fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    this.requests.push(body.type);
    const inRange = <T extends { time: number }>(rows: T[]) =>
      rows.filter((r) => r.time >= body.startTime && r.time <= (body.endTime ?? Infinity)).slice(0, this.pageSize);
    const available = [...this.fills].sort((a, b) => a.time - b.time).slice(-this.window);
    const data =
      body.type === "userFillsByTime" ? inRange(available) : body.type === "userFunding" ? inRange([...this.funding].sort((a, b) => a.time - b.time)) : null;
    return new Response(JSON.stringify(data), { status: data ? 200 : 422 });
  }) as typeof fetch;

  client() {
    return new HyperliquidClient(this.fetch);
  }
}
