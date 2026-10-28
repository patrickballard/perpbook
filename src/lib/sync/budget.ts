// Hyperliquid's REST weights, from its rate-limit docs: 1,200 per minute per IP, shared.
const LIGHT = new Set(["l2Book", "allMids", "clearinghouseState", "orderStatus", "spotClearinghouseState", "exchangeStatus"]);
// TWAP slice endpoints aren't in the docs' list; counting them per item errs on the safe side.
const PER_ITEM = new Set(["userFills", "userFillsByTime", "userFunding", "fundingHistory", "historicalOrders", "recentTrades", "userTwapSliceFills", "userTwapSliceFillsByTime"]);

export const baseWeight = (type: string) => (LIGHT.has(type) ? 2 : type === "userRole" ? 60 : 20);
/** Extra weight charged per 20 items returned. */
export const itemWeight = (type: string, items: number) => (PER_ITEM.has(type) ? Math.floor(items / 20) : 0);

export type BudgetState = { tokens: number; at: number };

/** Where several budgets on one IP keep a shared balance, e.g. every perpbook tab in a browser. */
export type BudgetStore = { load(): BudgetState | null; save(s: BudgetState): void };

/**
 * A token bucket refilled continuously at `perMinute`, so the worker never outruns its IP's budget.
 * With a store, the balance is read from and written back to it, so budgets sharing one see each other's spending.
 */
export class WeightBudget {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perMinute: number,
    private readonly clock: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly store?: BudgetStore,
  ) {
    this.tokens = perMinute;
    this.last = clock();
  }

  private refill() {
    const saved = this.store?.load();
    if (saved) ({ tokens: this.tokens, at: this.last } = saved);
    const now = this.clock();
    this.tokens = Math.min(this.perMinute, this.tokens + (Math.max(0, now - this.last) * this.perMinute) / 60_000);
    this.last = now;
  }

  private spend(w: number) {
    this.tokens -= w;
    this.store?.save({ tokens: this.tokens, at: this.last });
  }

  /** Wait until `w` is available, then spend it. Throws, spending nothing, if `signal` aborts first. */
  async take(w: number, signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.refill();
    while (this.tokens < Math.min(w, this.perMinute)) {
      await this.sleep(Math.ceil(((Math.min(w, this.perMinute) - this.tokens) * 60_000) / this.perMinute));
      signal?.throwIfAborted();
      this.refill();
    }
    this.spend(w);
  }

  /** Spend weight we only learn about afterwards (items returned); may go into debt. */
  charge(w: number) {
    this.refill();
    this.spend(w);
  }

  get available() {
    this.refill();
    return this.tokens;
  }
}

/** A store in the browser's localStorage, shared by its tabs; null where storage is blocked. */
export function localBudgetStore(key: string): BudgetStore | null {
  try {
    localStorage.setItem(`${key}:probe`, "1");
    localStorage.removeItem(`${key}:probe`);
  } catch {
    return null;
  }
  return {
    load() {
      try {
        const s = JSON.parse(localStorage.getItem(key) ?? "null") as BudgetState | null;
        return s && Number.isFinite(s.tokens) && Number.isFinite(s.at) ? s : null;
      } catch {
        return null;
      }
    },
    save(s) {
      try {
        localStorage.setItem(key, JSON.stringify(s));
      } catch {
        // full or blocked: this tab keeps its own count
      }
    },
  };
}

/**
 * Wrap fetch so every Hyperliquid info request is paid for from `budget`. With `signal`, requests
 * stop when it aborts, including any still waiting for budget, so they don't use up what's left.
 */
export function budgetedFetch(budget: WeightBudget, fetchImpl: typeof fetch = (...a) => fetch(...a), signal?: AbortSignal): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const type = String(JSON.parse(String(init?.body ?? "{}")).type ?? "");
    await budget.take(baseWeight(type), signal);
    const r = await fetchImpl(input, signal ? { ...init, signal } : init);
    if (r.ok && PER_ITEM.has(type)) {
      const rows = await r.clone().json().catch(() => null);
      if (Array.isArray(rows)) budget.charge(itemWeight(type, rows.length));
    }
    return r;
  }) as typeof fetch;
}
