import { describe, expect, it } from "vitest";
import { addressIn, HyperliquidClient } from "./client";

/** A fetch that answers with the given statuses in turn; 200s return `[]`. */
function scripted(statuses: number[], headers: Record<string, string> = {}) {
  const calls: number[] = [];
  const fetchImpl = (async () => {
    const status = statuses[Math.min(calls.length, statuses.length - 1)];
    calls.push(status);
    return new Response(status === 200 ? "[]" : "", { status, headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("HyperliquidClient", () => {
  it("retries a rate-limited request and then succeeds", async () => {
    const { fetchImpl, calls } = scripted([429, 429, 200]);
    const slept: number[] = [];
    const c = new HyperliquidClient(fetchImpl, undefined, async (ms) => void slept.push(ms));
    await expect(c.info({ type: "meta" })).resolves.toEqual([]);
    expect(calls).toEqual([429, 429, 200]);
    expect(slept).toEqual([1_000, 3_000]);
  });

  it("honours Retry-After", async () => {
    const { fetchImpl } = scripted([429, 200], { "Retry-After": "7" });
    const slept: number[] = [];
    const c = new HyperliquidClient(fetchImpl, undefined, async (ms) => void slept.push(ms));
    await c.info({ type: "meta" });
    expect(slept).toEqual([7_000]);
  });

  it("gives up after three retries with a readable message", async () => {
    const { fetchImpl, calls } = scripted([429]);
    const c = new HyperliquidClient(fetchImpl, undefined, async () => {});
    await expect(c.info({ type: "meta" })).rejects.toThrow(/rate limiting/);
    expect(calls).toHaveLength(4);
  });

  it("does not retry client errors", async () => {
    const { fetchImpl, calls } = scripted([422]);
    const c = new HyperliquidClient(fetchImpl, undefined, async () => {});
    await expect(c.info({ type: "meta" })).rejects.toThrow("Hyperliquid returned 422");
    expect(calls).toHaveLength(1);
  });
});

describe("addressIn", () => {
  const a = "0xf9f8383cd2f0c8b4378cf44036f66143271ef2e5";
  it("finds the one address in a pasted explorer link", () => {
    expect(addressIn(`https://hypurrscan.io/address/${a.toUpperCase().replace("0X", "0x")}`)).toBe(a);
    expect(addressIn(`  ${a}  `)).toBe(a);
  });
  it("leaves text alone when it has no address, two different ones, or a longer hash", () => {
    expect(addressIn(" hello ")).toBe("hello");
    expect(addressIn(`${a} 0x${"1".repeat(40)}`)).toBe(`${a} 0x${"1".repeat(40)}`);
    expect(addressIn(`0x${"ab".repeat(32)}`)).toBe(`0x${"ab".repeat(32)}`);
  });
});
