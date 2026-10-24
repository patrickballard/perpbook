import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing";
import { migrate } from "../db/migrations";
import { trackWallet } from "../db/store";
import { FakeHyperliquid } from "./fakeHyperliquid";
import { historyRequest, trackRequest, walletStatus } from "./api";
import { syncWallet } from "./sync";

const addr = (c: string) => "0x" + c.repeat(40);
const limits = { perIpPerDay: 2, maxWallets: 3 };
const T0 = Date.UTC(2026, 9, 1);

describe("trackRequest", () => {
  it("tracks a new wallet once and is idempotent after", async () => {
    const db = await testDb();
    expect(await trackRequest(db, addr("a"), "1.1.1.1", limits, T0)).toEqual({ status: 201, body: { tracked: true, created: true } });
    expect(await trackRequest(db, addr("a"), "2.2.2.2", limits, T0)).toEqual({ status: 200, body: { tracked: true, created: false } });
  });

  it("limits how many wallets one IP can add per day", async () => {
    const db = await testDb();
    await trackRequest(db, addr("a"), "1.1.1.1", limits, T0);
    await trackRequest(db, addr("b"), "1.1.1.1", limits, T0);
    expect((await trackRequest(db, addr("c"), "1.1.1.1", limits, T0)).status).toBe(429);
    expect((await trackRequest(db, addr("c"), "1.1.1.1", limits, T0 + 25 * 3_600_000)).status).toBe(201);
  });

  it("stops adding wallets at the global cap", async () => {
    const db = await testDb();
    for (const c of "abc") await trackWallet(db, addr(c), T0);
    expect((await trackRequest(db, addr("d"), "1.1.1.1", limits, T0)).status).toBe(503);
  });
});

describe("walletStatus and historyRequest", () => {
  it("says untracked wallets are untracked, and 404s their history", async () => {
    const db = await testDb();
    expect(await walletStatus(db, addr("a"))).toEqual({ status: 200, body: { state: "untracked" } });
    expect((await historyRequest(db, addr("a"), "fills", null)).status).toBe(404);
    expect((await historyRequest(db, addr("a"), "orders", null)).status).toBe(400);
  });

  it("serves normalised history for tracked wallets, without spot fills", async () => {
    const db = await testDb();
    const A = addr("a");
    const hl = new FakeHyperliquid();
    hl.trade(T0, "buy", 1);
    hl.trade(T0 + 1, "buy", 5, 1, "@107"); // spot
    hl.pay(T0 + 2, -0.25);
    await trackWallet(db, A, T0);
    await syncWallet(db, hl.client(), A, T0 + 3);

    const status = await walletStatus(db, A, T0 + 4);
    expect(status).toMatchObject({ status: 200, body: { state: "tracked", status: { tracked: true, lastSyncedAt: T0 + 3, gaps: [] } } });
    const fills = await historyRequest(db, A, "fills", null);
    expect(fills).toMatchObject({ status: 200, body: { next: null, rows: [{ coin: "BTC", side: "buy", sz: 1, px: 100 }] } });
    const funding = await historyRequest(db, A, "funding", null);
    expect(funding).toMatchObject({ status: 200, body: { rows: [{ coin: "BTC", usdc: -0.25 }] } });
  });
});

describe("migrate", () => {
  it("is a no-op the second time", async () => {
    const db = await testDb();
    expect(await migrate(db)).toBe(0);
  });
});
