import { describe, expect, it } from "vitest";
import { budgetedFetch, WeightBudget } from "./budget";

function fakeTime() {
  let now = 0;
  const slept: number[] = [];
  return {
    clock: () => now,
    sleep: async (ms: number) => {
      slept.push(ms);
      now += ms;
    },
    slept,
  };
}

describe("WeightBudget", () => {
  it("spends freely up to the budget, then waits for it to refill", async () => {
    const t = fakeTime();
    const b = new WeightBudget(1_200, t.clock, t.sleep);
    for (let i = 0; i < 60; i++) await b.take(20); // 1,200
    expect(t.slept).toEqual([]);
    await b.take(20);
    expect(t.slept).toEqual([1_000]); // 20 weight refills in 1s at 1,200/min
  });

  it("waits off debt from items charged after the response", async () => {
    const t = fakeTime();
    const b = new WeightBudget(1_200, t.clock, t.sleep);
    b.charge(1_800); // 600 in debt
    await b.take(20);
    expect(t.slept).toEqual([31_000]);
  });
});

describe("budgetedFetch", () => {
  it("charges the base weight before and the per-item weight after", async () => {
    const t = fakeTime();
    const b = new WeightBudget(1_200, t.clock, t.sleep);
    const rows = Array.from({ length: 2_000 }, () => ({}));
    const f = budgetedFetch(b, async () => new Response(JSON.stringify(rows)));
    const r = await f("https://api.hyperliquid.xyz/info", { method: "POST", body: JSON.stringify({ type: "userFillsByTime" }) });
    expect(await r.json()).toHaveLength(2_000);
    expect(b.available).toBe(1_200 - 20 - 100);

    await f("https://api.hyperliquid.xyz/info", { method: "POST", body: JSON.stringify({ type: "clearinghouseState" }) });
    expect(b.available).toBe(1_200 - 20 - 100 - 2);
  });

  it("stops a cancelled load, even one waiting for budget, without spending any", async () => {
    const t = fakeTime();
    const b = new WeightBudget(1_200, t.clock, t.sleep);
    b.charge(1_200); // empty: the next request has to wait
    const ac = new AbortController();
    let sent = 0;
    const f = budgetedFetch(b, async () => (sent++, new Response("[]")), ac.signal);
    const body = { method: "POST", body: JSON.stringify({ type: "userFills" }) };
    const waiting = f("https://api.hyperliquid.xyz/info", body);
    ac.abort(); // e.g. the visitor opened another wallet
    await expect(waiting).rejects.toThrow();
    expect(sent).toBe(0);
    await expect(f("https://api.hyperliquid.xyz/info", body)).rejects.toThrow();
    expect(sent).toBe(0);
    expect(b.available).toBeGreaterThanOrEqual(0); // nothing taken for the cancelled requests
  });
});
