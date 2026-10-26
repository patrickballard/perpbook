import { describe, expect, it } from "vitest";
import { loadFromHyperliquid, type Loaded } from "./load";
import { FakeHyperliquid } from "./sync/fakeHyperliquid";
import { CACHE_VERSION, memoryStore } from "./walletCache";

const A = "0x" + "a".repeat(40);
const T0 = Date.UTC(2026, 9, 1);
const opts = { fillPages: 10, fundingPages: 10 };

function wallet() {
  const hl = new FakeHyperliquid(10_000, 2); // 2 rows per page, so paging shows up in request counts
  for (let i = 0; i < 6; i++) hl.trade(T0 + i * 1000, i % 2 ? "sell" : "buy", 1);
  for (let i = 0; i < 4; i++) hl.pay(T0 + i * 1000 + 500, -0.1);
  return hl;
}
const requestsOf = (hl: FakeHyperliquid, type: string) => hl.requests.filter((t) => t === type).length;

describe("loadFromHyperliquid", () => {
  it("hands over the fills before loading funding, then finishes with everything", async () => {
    const hl = wallet();
    const partials: Loaded[] = [];
    const done = await loadFromHyperliquid(hl.client(), A, { ...opts, onFills: (p) => partials.push(p) });
    expect(partials).toHaveLength(1);
    expect(partials[0]).toMatchObject({ fundingPending: true, complete: true });
    expect(partials[0].fills).toHaveLength(6);
    expect(partials[0].funding).toHaveLength(0);
    expect(done).toMatchObject({ fundingPending: false, complete: true });
    expect(done.funding).toHaveLength(4);
  });

  it("on a repeat visit fetches only what's new, and merges it without duplicates", async () => {
    const hl = wallet();
    const cache = memoryStore();
    await loadFromHyperliquid(hl.client(), A, { ...opts, cache });
    const firstFillRequests = requestsOf(hl, "userFillsByTime");
    const firstFundingRequests = requestsOf(hl, "userFunding");

    hl.trade(T0 + 10_000, "buy", 1);
    hl.pay(T0 + 10_500, -0.2);
    hl.requests = [];
    const again = await loadFromHyperliquid(hl.client(), A, { ...opts, cache });

    expect(requestsOf(hl, "userFillsByTime")).toBeLessThan(firstFillRequests);
    expect(requestsOf(hl, "userFunding")).toBeLessThan(firstFundingRequests);
    expect(again.fills).toHaveLength(7);
    expect(new Set(again.fills.map((f) => f.id)).size).toBe(7);
    expect(again.funding).toHaveLength(5);
  });

  it("shows the browser's copy while new funding loads", async () => {
    const hl = wallet();
    const cache = memoryStore();
    await loadFromHyperliquid(hl.client(), A, { ...opts, cache });
    let partial: Loaded | null = null;
    await loadFromHyperliquid(hl.client(), A, { ...opts, cache, onFills: (p) => (partial = p) });
    expect(partial!.funding).toHaveLength(4);
  });

  it("doesn't fetch funding or save a copy for a wallet too active to load", async () => {
    const hl = wallet();
    const cache = memoryStore();
    const loaded = await loadFromHyperliquid(hl.client(), A, { fillPages: 2, fundingPages: 10, cache });
    expect(loaded.complete).toBe(false);
    expect(requestsOf(hl, "userFunding")).toBe(0);
    expect(await cache.get(A)).toBeNull();
  });

  it("ignores a copy saved by an older version", async () => {
    const hl = wallet();
    const cache = memoryStore();
    await cache.set(A, { version: CACHE_VERSION - 1, fills: [], funding: [], savedAt: 0 });
    const loaded = await loadFromHyperliquid(hl.client(), A, { ...opts, cache });
    expect(loaded.fills).toHaveLength(6);
    expect((await cache.get(A))?.version).toBe(CACHE_VERSION);
  });
});
