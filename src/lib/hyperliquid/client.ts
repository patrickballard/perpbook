import { fillId } from "./normalise";
import type { HlClearinghouseState, HlFill, HlFunding, HlPortfolio } from "./types";

export const HL_INFO_URL = "https://api.hyperliquid.xyz/info";

export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

type FetchLike = typeof fetch;

/** Rows from a paged endpoint, and whether we reached the end or stopped at the page limit. */
export type Paged<T> = { rows: T[]; complete: boolean };

/** Waits before each retry of a rate-limited (429) or failing (5xx) request. */
const RETRY_DELAYS_MS = [1_000, 3_000, 10_000];

export const RATE_LIMITED = "Hyperliquid is rate limiting requests; try again in a minute";

/** Most TWAP slices the documented `userTwapSliceFills` returns (the newest ones). */
const TWAP_RECENT_MAX = 2_000;


const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How long the list of perp dexes is reused; new dexes are rare and every load asks for it. */
const DEXS_TTL_MS = 10 * 60_000;

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
  private async paged<T extends { time: number }, Raw = T>(
    type: string,
    user: string,
    idOf: (row: T) => string,
    startTime = 0,
    maxPages = 60,
    onProgress?: (rows: number) => void,
    unwrap: (raw: Raw) => T = (raw) => raw as unknown as T,
  ): Promise<Paged<T>> {
    const out = new Map<string, T>();
    let start = startTime;
    let complete = false;
    for (let i = 0; i < maxPages; i++) {
      const raw = await this.info<Raw[]>({ type, user, startTime: start, endTime: Date.now() });
      const batch = Array.isArray(raw) ? raw.map(unwrap) : raw;
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
      onProgress?.(out.size);
    }
    // Stopping at maxPages used to look exactly like the end of history, so very active wallets
    // (James Wynn has 300,000+ fills) were shown as if a fraction of their trades were all of them.
    return { rows: [...out.values()].sort((a, b) => a.time - b.time), complete };
  }

  /**
   * Every fill, TWAP slices included: Hyperliquid leaves those out of userFillsByTime, so a
   * trader using TWAP orders would otherwise have positions jump between fills.
   */
  async fills(user: string, startTime = 0, maxPages?: number, onProgress?: (rows: number) => void): Promise<Paged<HlFill>> {
    const [plain, twap] = await Promise.all([
      this.paged<HlFill>("userFillsByTime", user, fillId, startTime, maxPages, onProgress),
      this.twapFills(user, startTime, maxPages),
    ]);
    if (!twap.rows.length) return plain;
    // A list that stopped at the page limit only covers up to its last row, so the merged list is
    // only whole up to the earlier stop; anything later waits for the next fetch, which starts there.
    const end = (p: Paged<HlFill>) => (p.complete ? Infinity : p.rows.at(-1)!.time);
    const cut = Math.min(end(plain), end(twap));
    const tids = new Set(plain.rows.map((f) => f.tid));
    const rows = [...plain.rows, ...twap.rows.filter((f) => !tids.has(f.tid))].filter((f) => f.time <= cut).sort((a, b) => a.time - b.time);
    return { rows, complete: plain.complete && twap.complete };
  }

  /** TWAP slices from `startTime`, oldest first, like userFillsByTime. fills() includes them already. */
  async twapFills(user: string, startTime: number, maxPages?: number): Promise<Paged<HlFill>> {
    const unwrap = (r: { fill: HlFill }) => r.fill;
    try {
      // Not in Hyperliquid's docs (Oct 2026), but pages by time like the other fill endpoints.
      return await this.paged("userTwapSliceFillsByTime", user, fillId, startTime, maxPages, undefined, unwrap);
    } catch (e) {
      // If it ever goes away (a 4xx), fall back to the documented endpoint: the latest 2,000 only.
      if (!(e instanceof Error && /returned 4\d\d/.test(e.message))) throw e;
      const recent = (await this.info<{ fill: HlFill }[]>({ type: "userTwapSliceFills", user })).map(unwrap);
      const rows = recent.filter((f) => f.time >= startTime).sort((a, b) => a.time - b.time);
      return { rows, complete: recent.length < TWAP_RECENT_MAX };
    }
  }

  funding(user: string, startTime = 0, maxPages?: number, onProgress?: (rows: number) => void) {
    return this.paged<HlFunding>("userFunding", user, (f) => `${f.hash}-${f.time}-${f.delta?.coin}`, startTime, maxPages, onProgress);
  }

  private dexs?: { at: number; names: Promise<string[]> };

  /** Every perp dex: "" is Hyperliquid's own, the rest are builder-deployed (HIP-3) markets. */
  perpDexs(): Promise<string[]> {
    const now = Date.now();
    if (!this.dexs || now - this.dexs.at > DEXS_TTL_MS) {
      const names = this.info<({ name: string } | null)[]>({ type: "perpDexs" }).then((d) => d.map((x) => x?.name ?? ""));
      // Don't keep a failure: the next caller asks again.
      names.catch(() => this.dexs?.names === names && (this.dexs = undefined));
      this.dexs = { at: now, names };
    }
    return this.dexs.names;
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
