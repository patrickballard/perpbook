import { describe, expect, it } from "vitest";
import { HyperliquidClient } from "./hyperliquid/client";
import { liveState, loadFromHyperliquid, type Loaded } from "./load";
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

  it("uses live state the page already asked for instead of asking again for the first snapshot", async () => {
    const hl = wallet();
    const live = liveState(hl.client(), A);
    await live;
    const asked = requestsOf(hl, "portfolio");
    await loadFromHyperliquid(hl.client(), A, { ...opts, live });
    // Only the final snapshot, taken after funding so the check compares the same moment.
    expect(requestsOf(hl, "portfolio") - asked).toBe(1);
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

  it("on a repeat visit asks for new fills, new funding and live state at once, and finishes in one go", async () => {
    const hl = wallet();
    const cache = memoryStore();
    await loadFromHyperliquid(hl.client(), A, { ...opts, cache });

    // Each request takes a moment, so anything waiting on another shows up as starting after an end.
    const log: string[] = [];
    const slow = (async (url: string, init?: RequestInit) => {
      const type = JSON.parse(String(init?.body)).type;
      log.push(`start ${type}`);
      await new Promise((r) => setTimeout(r, 5));
      log.push(`end ${type}`);
      return hl.fetch(url, init);
    }) as typeof fetch;
    let partial: Loaded | null = null;
    const again = await loadFromHyperliquid(new HyperliquidClient(slow), A, { ...opts, cache, onFills: (p) => (partial = p) });

    const firstEnd = log.findIndex((e) => e.startsWith("end"));
    for (const type of ["userFillsByTime", "userFunding", "portfolio", "perpDexs"]) expect(log.indexOf(`start ${type}`)).toBeLessThan(firstEnd);
    expect(partial).toBeNull();
    expect(again).toMatchObject({ complete: true, fundingPending: false });
    expect(again.funding).toHaveLength(4);
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

  it("skips the Hyperliquid check when positions couldn't be loaded", async () => {
    // Without positions, unrealised PnL is unknown; comparing anyway would say "doesn't match".
    const portfolio = [["perpAllTime", { pnlHistory: [[1, "10"]], accountValueHistory: [], vlm: "0" }]];
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      const type = JSON.parse(String(init?.body)).type;
      return type === "portfolio" ? new Response(JSON.stringify(portfolio)) : new Response("", { status: 400 });
    }) as typeof fetch;
    const live = await liveState(new HyperliquidClient(fetchImpl), A);
    expect(live.hyperliquidPnl).toBeNull();
    expect(live.positions).toEqual([]);
    expect(live.summary?.allTime).toBe(10);
  });
});
