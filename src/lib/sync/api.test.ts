import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing";
import { migrate, migratedOnFirstUse } from "../db/migrations";
import { trackWallet } from "../db/store";
import { FakeHyperliquid } from "./fakeHyperliquid";
import { clientIp, historyRequest, trackLimits, trackRequest, walletStatus } from "./api";
import { syncWallet } from "./sync";

const addr = (c: string) => "0x" + c.repeat(40);
const limits = { perIpPerDay: 2, maxWallets: 3, storageMb: 400 };
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
    // Requests over two days old are cleared out as new ones arrive: at 72h, the three from T0 go
    // and the ones from 25h and 72h stay.
    await trackRequest(db, addr("d"), "2.2.2.2", limits, T0 + 72 * 3_600_000);
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from track_requests");
    expect(rows[0].n).toBe(2);
  });

  it("stops adding wallets at the global cap", async () => {
    const db = await testDb();
    for (const c of "abc") await trackWallet(db, addr(c), T0);
    expect((await trackRequest(db, addr("d"), "1.1.1.1", limits, T0)).status).toBe(503);
  });

  it("stops adding wallets when the database is near its storage limit", async () => {
    const db = await testDb(); // an empty PGlite database is a few MB
    expect((await trackRequest(db, addr("a"), "1.1.1.1", { ...limits, storageMb: 1 }, T0)).status).toBe(503);
    expect((await trackRequest(db, addr("a"), "1.1.1.1", limits, T0)).status).toBe(201);
  });
});

describe("clientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("uses only a header a trusted proxy sets", () => {
    // On Vercel: X-Real-IP, which Vercel sets; a forged X-Forwarded-For is ignored.
    expect(clientIp(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }), { VERCEL: "1" })).toBe("1.1.1.1");
    // Behind your own proxy: the header you name, last entry (the one your proxy added).
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9, 2.2.2.2" }), { CLIENT_IP_HEADER: "x-forwarded-for" })).toBe("2.2.2.2");
    expect(clientIp(h({ "cf-connecting-ip": "3.3.3.3" }), { CLIENT_IP_HEADER: "cf-connecting-ip" })).toBe("3.3.3.3");
  });

  it("doesn't trust headers anyone could send when nothing says which to trust", () => {
    expect(clientIp(h({ "x-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8" }), {})).toBe("unknown");
    expect(clientIp(h({}), { VERCEL: "1" })).toBe("unknown");
  });
});

describe("trackLimits", () => {
  it("reads whole numbers and falls back on anything else instead of switching the limit off", () => {
    expect(trackLimits({})).toEqual({ perIpPerDay: 3, maxWallets: 2_000, storageMb: 400 });
    expect(trackLimits({ TRACK_PER_IP_PER_DAY: "10", MAX_TRACKED_WALLETS: "0" })).toEqual({ perIpPerDay: 10, maxWallets: 0, storageMb: 400 });
    expect(trackLimits({ TRACK_PER_IP_PER_DAY: "three", MAX_TRACKED_WALLETS: "-5" })).toEqual({ perIpPerDay: 3, maxWallets: 2_000, storageMb: 400 });
    expect(trackLimits({ TRACK_PER_IP_PER_DAY: "2.5", MAX_TRACKED_WALLETS: " " })).toEqual({ perIpPerDay: 3, maxWallets: 2_000, storageMb: 400 });
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

describe("migratedOnFirstUse", () => {
  it("brings an empty database up to date before the app's first query, once", async () => {
    const raw = await testDb({ migrated: false });
    let migrations = 0;
    const counted: typeof raw = { query: raw.query, transaction: (fn) => (migrations++, raw.transaction(fn)) };
    const db = migratedOnFirstUse(counted);
    await Promise.all([walletStatus(db, addr("a")), walletStatus(db, addr("a"))]);
    expect((await walletStatus(db, addr("a"))).body).toEqual({ state: "untracked" });
    expect(migrations).toBe(1);
  });
});

describe("migrate", () => {
  it("is a no-op the second time", async () => {
    const db = await testDb();
    expect(await migrate(db)).toBe(0);
  });
});
