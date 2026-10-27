import { describe, expect, it } from "vitest";
import { FakeHyperliquid } from "../sync/fakeHyperliquid";
import { normaliseFills } from "./normalise";
import { buildTrades } from "../engine/trades";

const A = "0x" + "b".repeat(40);
const T0 = Date.UTC(2026, 9, 18);

/** A short opened by hand and by a TWAP order, closed by hand: what 0xb15b did on 18 Oct. */
function wallet(pageSize = 2_000) {
  const hl = new FakeHyperliquid(10_000, pageSize);
  hl.trade(T0, "sell", 5);
  for (let i = 1; i <= 4; i++) hl.twap(T0 + i * 30_000, "sell", 1);
  hl.trade(T0 + 200_000, "sell", 2);
  hl.trade(T0 + 300_000, "buy", 11);
  return hl;
}

describe("TWAP slices", () => {
  it("are included in fills, in time order, so trades rebuild without gaps", async () => {
    const page = await wallet().client().fills(A);
    expect(page.complete).toBe(true);
    expect(page.rows.map((f) => f.time)).toEqual([0, 30, 60, 90, 120, 200, 300].map((s) => T0 + s * 1000));
    const trades = buildTrades(normaliseFills(page.rows));
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ status: "closed", partialHistory: false, fillCount: 7, maxSize: 11 });
  });

  it("aren't lost when the regular fills stop at the page limit", async () => {
    const hl = wallet(2); // two rows per page
    const first = await hl.client().fills(A, 0, 1);
    expect(first.complete).toBe(false);
    // One page each: regular fills reach 200s, slices only 60s. Only whole up to 60s; the regular
    // fill at 200s waits for the next fetch, which starts at 60s.
    expect(first.rows.map((f) => f.time)).toEqual([0, 30, 60].map((s) => T0 + s * 1000));
    const rest = await hl.client().fills(A, first.rows.at(-1)!.time, 10);
    const all = new Set([...first.rows, ...rest.rows].map((f) => f.tid));
    expect(all.size).toBe(7);
  });

  it("fall back to the documented endpoint if the undocumented one goes away", async () => {
    const hl = wallet();
    hl.twapByTime = false;
    const page = await hl.client().fills(A, T0 + 60_000);
    expect(page.complete).toBe(true);
    expect(page.rows.map((f) => f.time)).toEqual([60, 90, 120, 200, 300].map((s) => T0 + s * 1000));
    expect(hl.requests).toContain("userTwapSliceFills");
  });

  it("don't duplicate a slice that also shows up among regular fills", async () => {
    const hl = wallet();
    hl.fills.push({ ...hl.twaps[0], hash: "0xabc" });
    const page = await hl.client().fills(A);
    expect(page.rows.filter((f) => f.tid === hl.twaps[0].tid)).toHaveLength(1);
  });
});
