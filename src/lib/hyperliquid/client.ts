import type { HlClearinghouseState, HlFill, HlFunding, HlPortfolio } from "./types";

export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

type FetchLike = typeof fetch;

export class HyperliquidClient {
  constructor(
    private readonly fetchImpl: FetchLike = (...a) => fetch(...a),
    private readonly url = HL_INFO_URL,
  ) {}

  async info<T>(body: Record<string, unknown>): Promise<T> {
    const r = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Hyperliquid returned ${r.status}`);
    return r.json() as Promise<T>;
  }

  /**
   * Time-range endpoints return a capped page; continue from the last timestamp
   * until a page adds nothing new. Hyperliquid only exposes the 10,000 most
   * recent fills, so anything older must already be stored on our side.
   */
  private async paged<T extends { time: number }>(
    type: string,
    user: string,
    idOf: (row: T) => string,
    startTime = 0,
    maxPages = 60,
  ): Promise<T[]> {
    const out = new Map<string, T>();
    let start = startTime;
    for (let i = 0; i < maxPages; i++) {
      const batch = await this.info<T[]>({ type, user, startTime: start, endTime: Date.now() });
      if (!Array.isArray(batch) || batch.length === 0) break;
      let added = 0;
      for (const row of batch) {
        const id = idOf(row);
        if (!out.has(id)) {
          out.set(id, row);
          added++;
        }
      }
      if (added === 0) break;
      start = Math.max(...batch.map((r) => r.time));
    }
    return [...out.values()].sort((a, b) => a.time - b.time);
  }

  fills(user: string, startTime = 0) {
    return this.paged<HlFill>("userFillsByTime", user, (f) => `${f.tid}-${f.hash}`, startTime);
  }

  funding(user: string, startTime = 0) {
    return this.paged<HlFunding>(
      "userFunding",
      user,
      (f) => `${f.hash}-${f.time}-${f.delta?.coin}`,
      startTime,
    );
  }

  /** Every perp dex: "" is Hyperliquid's own, the rest are builder-deployed (HIP-3) markets. */
  async perpDexs(): Promise<string[]> {
    const dexs = await this.info<({ name: string } | null)[]>({ type: "perpDexs" });
    return dexs.map((d) => d?.name ?? "");
  }

  clearinghouse(user: string, dex = "") {
    return this.info<HlClearinghouseState>({ type: "clearinghouseState", user, ...(dex ? { dex } : {}) });
  }

  /** Positions on every perp dex; HIP-3 positions only come back when asked for by dex. */
  async allClearinghouses(user: string): Promise<HlClearinghouseState[]> {
    const dexs = await this.perpDexs().catch(() => [""]);
    return Promise.all(dexs.map((dex) => this.clearinghouse(user, dex)));
  }

  /** Hyperliquid's own PnL and account value history, as shown on its portfolio page. */
  portfolio(user: string) {
    return this.info<HlPortfolio>({ type: "portfolio", user });
  }
}
