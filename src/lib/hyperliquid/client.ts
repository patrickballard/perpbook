import type { HlClearinghouseState, HlFill, HlFunding, HlPortfolio } from "./types";

export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

type FetchLike = typeof fetch;

/** Rows from a paged endpoint, and whether we reached the end or stopped at the page limit. */
export type Paged<T> = { rows: T[]; complete: boolean };

/** Waits before each retry of a rate-limited (429) or failing (5xx) request. */
const RETRY_DELAYS_MS = [1_000, 3_000, 10_000];

export const RATE_LIMITED = "Hyperliquid is rate limiting requests; try again in a minute";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HyperliquidClient {
  constructor(
    private readonly fetchImpl: FetchLike = (...a) => fetch(...a),
    private readonly url = HL_INFO_URL,
    private readonly sleep: (ms: number) => Promise<void> = wait,
  ) {}

  /**
   * Hyperliquid limits each IP to a weight budget per minute, and a full sync of an
   * active wallet can use most of it, so a 429 usually clears within seconds.
   */
  async info<T>(body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) return r.json() as Promise<T>;
      const retryable = r.status === 429 || r.status >= 500;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
        throw new Error(r.status === 429 ? RATE_LIMITED : `Hyperliquid returned ${r.status}`);
      }
      const retryAfter = Number(r.headers.get("retry-after"));
      await this.sleep(retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAYS_MS[attempt]);
    }
  }

  /**
   * Time-range endpoints return a capped page; continue from the last timestamp
   * until a page adds nothing new. Hyperliquid's docs say only the 10,000 most
   * recent fills are available, though in practice (Oct 2026) older ones still are.
   */
  private async paged<T extends { time: number }>(
    type: string,
    user: string,
    idOf: (row: T) => string,
    startTime = 0,
    maxPages = 60,
  ): Promise<Paged<T>> {
    const out = new Map<string, T>();
    let start = startTime;
    let complete = false;
    for (let i = 0; i < maxPages; i++) {
      const batch = await this.info<T[]>({ type, user, startTime: start, endTime: Date.now() });
      if (!Array.isArray(batch) || batch.length === 0) {
        complete = true;
        break;
      }
      let added = 0;
      for (const row of batch) {
        const id = idOf(row);
        if (!out.has(id)) {
          out.set(id, row);
          added++;
        }
      }
      if (added === 0) {
        complete = true;
        break;
      }
      start = Math.max(...batch.map((r) => r.time));
    }
    // Stopping at maxPages used to look exactly like the end of history, so very active wallets
    // (James Wynn has 300,000+ fills) were shown as if a fraction of their trades were all of them.
    return { rows: [...out.values()].sort((a, b) => a.time - b.time), complete };
  }

  fills(user: string, startTime = 0, maxPages?: number) {
    return this.paged<HlFill>("userFillsByTime", user, (f) => `${f.tid}-${f.hash}`, startTime, maxPages);
  }

  funding(user: string, startTime = 0, maxPages?: number) {
    return this.paged<HlFunding>("userFunding", user, (f) => `${f.hash}-${f.time}-${f.delta?.coin}`, startTime, maxPages);
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
