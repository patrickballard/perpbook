import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing";
import { getWallet, trackWallet } from "../db/store";
import { FakeHyperliquid } from "./fakeHyperliquid";
import { runWorker } from "./worker";

const addr = (c: string) => "0x" + c.repeat(40);
const T0 = Date.UTC(2026, 9, 1);

describe("runWorker once", () => {
  it("syncs every due wallet, leaves the rest, and returns totals", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    hl.trade(T0 - 2_000, "buy", 1);
    hl.trade(T0 - 1_000, "sell", 1);
    await trackWallet(db, addr("a"), T0);
    await trackWallet(db, addr("b"), T0);
    await trackWallet(db, addr("c"), T0 + 60 * 60_000); // not due yet

    const totals = await runWorker(db, hl.client(), { once: true, now: () => T0 });
    expect(totals).toEqual({ synced: 2, failed: 0, newFills: 4, newFunding: 0, gaps: 0 });
    expect((await getWallet(db, addr("c")))?.lastSyncedAt).toBeNull();
  });

  it("records failures and keeps going", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    const client = hl.client();
    client.fills = async () => {
      throw new Error("Hyperliquid returned 500");
    };
    await trackWallet(db, addr("a"), T0);
    const totals = await runWorker(db, client, { once: true, now: () => T0 });
    expect(totals).toMatchObject({ synced: 0, failed: 1 });
    expect(await getWallet(db, addr("a"))).toMatchObject({ syncError: "Hyperliquid returned 500", nextSyncAt: T0 + 15 * 60_000 });
  });

  it("keeps wallet addresses out of the logs when asked", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    await trackWallet(db, addr("a"), T0);
    const lines: string[] = [];
    const log = (msg: string, extra?: Record<string, unknown>) => void lines.push(JSON.stringify({ msg, ...extra }));
    await runWorker(db, hl.client(), { once: true, now: () => T0, perWalletLogs: false, log });
    expect(lines.join("\n")).not.toContain(addr("a"));
  });

  it("stops claiming wallets once its time is up", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    for (const c of "abc") await trackWallet(db, addr(c), T0);
    let t = T0;
    const now = () => (t += 60_000); // every call moves the clock a minute on
    const totals = await runWorker(db, hl.client(), { once: true, maxMs: 2 * 60_000, now });
    expect(totals.synced).toBeLessThan(3);
  });
});
