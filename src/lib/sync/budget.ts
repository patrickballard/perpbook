// Hyperliquid's REST weights, from its rate-limit docs: 1,200 per minute per IP, shared.
const LIGHT = new Set(["l2Book", "allMids", "clearinghouseState", "orderStatus", "spotClearinghouseState", "exchangeStatus"]);
// TWAP slice endpoints aren't in the docs' list; counting them per item errs on the safe side.
const PER_ITEM = new Set(["userFills", "userFillsByTime", "userFunding", "fundingHistory", "historicalOrders", "recentTrades", "userTwapSliceFills", "userTwapSliceFillsByTime"]);

export const baseWeight = (type: string) => (LIGHT.has(type) ? 2 : type === "userRole" ? 60 : 20);
/** Extra weight charged per 20 items returned. */
export const itemWeight = (type: string, items: number) => (PER_ITEM.has(type) ? Math.floor(items / 20) : 0);

/** A token bucket refilled continuously at `perMinute`, so the worker never outruns its IP's budget. */
export class WeightBudget {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perMinute: number,
    private readonly clock: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.tokens = perMinute;
    this.last = clock();
  }

  private refill() {
    const now = this.clock();
    this.tokens = Math.min(this.perMinute, this.tokens + ((now - this.last) * this.perMinute) / 60_000);
    this.last = now;
  }

  /** Wait until `w` is available, then spend it. */
  async take(w: number) {
    this.refill();
    while (this.tokens < Math.min(w, this.perMinute)) {
      await this.sleep(Math.ceil(((Math.min(w, this.perMinute) - this.tokens) * 60_000) / this.perMinute));
      this.refill();
    }
    this.tokens -= w;
  }

  /** Spend weight we only learn about afterwards (items returned); may go into debt. */
  charge(w: number) {
    this.refill();
    this.tokens -= w;
  }

  get available() {
    this.refill();
    return this.tokens;
  }
}

/** Wrap fetch so every Hyperliquid info request is paid for from `budget`. */
export function budgetedFetch(budget: WeightBudget, fetchImpl: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const type = String(JSON.parse(String(init?.body ?? "{}")).type ?? "");
    await budget.take(baseWeight(type));
    const r = await fetchImpl(input, init);
    if (r.ok && PER_ITEM.has(type)) {
      const rows = await r.clone().json().catch(() => null);
      if (Array.isArray(rows)) budget.charge(itemWeight(type, rows.length));
    }
    return r;
  }) as typeof fetch;
}
