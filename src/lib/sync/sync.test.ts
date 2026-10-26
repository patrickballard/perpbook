import { describe, expect, it } from "vitest";
import { testDb } from "../db/testing";
import { claimDueWallet, type Cursor, decodeCursor, encodeCursor, getGaps, getWallet, historyPage, nextDueAt, trackWallet } from "../db/store";
import { normaliseFills } from "../hyperliquid/normalise";
import type { HlFill } from "../hyperliquid/types";
import { buildTrades } from "../engine/trades";
import { FakeHyperliquid } from "./fakeHyperliquid";
import { IDLE_WAIT_MAX, idleWait, nextInterval, syncWallet } from "./sync";

const A = "0x" + "a".repeat(40);
const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);

async function allFills(db: Awaited<ReturnType<typeof testDb>>, pageSize = 5_000) {
  const out: HlFill[] = [];
  let cursor: Cursor | null = null;
  do {
    const page: { rows: HlFill[]; next: Cursor | null } = await historyPage<HlFill>(db, "fills", A, cursor, pageSize);
    out.push(...page.rows);
    cursor = page.next;
  } while (cursor);
  return out;
}

describe("syncWallet", () => {
  it("stores fills and funding on the first sync", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    hl.trade(T0, "buy", 1);
    hl.pay(T0 + H, -0.5);
    hl.trade(T0 + 2 * H, "sell", 1);
    await trackWallet(db, A, T0 + 3 * H);

    const r = await syncWallet(db, hl.client(), A, T0 + 3 * H);
    expect(r).toMatchObject({ newFills: 2, newFunding: 1, gap: null });
    const w = await getWallet(db, A);
    expect(w).toMatchObject({ lastFillTime: T0 + 2 * H, lastFundingTime: T0 + H, syncError: null, lastSyncedAt: T0 + 3 * H });
  });

  it("keeps history that has fallen out of Hyperliquid's window", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid(5, 2); // Hyperliquid only keeps the last 5 fills, 2 per page
    await trackWallet(db, A, T0);
    let t = T0;
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 4; i++) hl.trade((t += 1000), i % 2 ? "sell" : "buy", 1);
      await syncWallet(db, hl.client(), A, t + 1);
    }
    const stored = await allFills(db);
    expect(stored).toHaveLength(16);
    expect(await getGaps(db, A)).toEqual([]);
    const trades = buildTrades(normaliseFills(stored));
    expect(trades).toHaveLength(8);
    expect(trades.every((x) => !x.partialHistory && x.status === "closed")).toBe(true);
  });

  it("records a gap when more fills happened than Hyperliquid keeps", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid(5, 2);
    await trackWallet(db, A, T0);
    hl.trade(T0 + 1, "buy", 1);
    await syncWallet(db, hl.client(), A, T0 + 2);
    for (let i = 0; i < 8; i++) hl.trade(T0 + 10 + i, i % 2 ? "buy" : "sell", 1);

    const r = await syncWallet(db, hl.client(), A, T0 + 100);
    expect(r.gap).toEqual({ fromTime: T0 + 1, toTime: T0 + 13 });
    expect(await getGaps(db, A)).toEqual([{ fromTime: T0 + 1, toTime: T0 + 13 }]);
  });

  it("adds nothing and records no gap when nothing happened", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    hl.trade(T0, "buy", 1);
    hl.pay(T0 + H, -0.5);
    await trackWallet(db, A, T0);
    await syncWallet(db, hl.client(), A, T0 + 2 * H);
    const r = await syncWallet(db, hl.client(), A, T0 + 3 * H);
    expect(r).toMatchObject({ newFills: 0, newFunding: 0, gap: null });
  });

  it("leaves the wallet untouched when Hyperliquid fails mid-sync", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    hl.trade(T0, "buy", 1);
    await trackWallet(db, A, T0);
    const client = hl.client();
    client.funding = async () => {
      throw new Error("boom");
    };
    await expect(syncWallet(db, client, A, T0 + H)).rejects.toThrow("boom");
    expect(await allFills(db)).toHaveLength(0);
    expect((await getWallet(db, A))?.lastFillTime).toBeNull();
  });

  it("schedules busy wallets sooner and idle wallets daily", () => {
    expect(nextInterval(0, false)).toBe(6 * H);
    expect(nextInterval(2_500, false)).toBe(2 * H);
    expect(nextInterval(1_000_000, false)).toBe(10 * 60_000);
    expect(nextInterval(2_500, true)).toBe(24 * H);
  });
});

describe("store", () => {
  it("claims each due wallet once, with a lease", async () => {
    const db = await testDb();
    await trackWallet(db, A, T0);
    expect(await claimDueWallet(db, T0)).toBe(A);
    expect(await claimDueWallet(db, T0 + 60_000)).toBeNull(); // leased
    expect(await claimDueWallet(db, T0 + 11 * 60_000)).toBe(A); // lease ran out
  });

  it("pages history without losing fills that share a millisecond", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid();
    for (let i = 0; i < 7; i++) hl.trade(T0 + Math.floor(i / 3), i % 2 ? "sell" : "buy", 1);
    await trackWallet(db, A, T0);
    await syncWallet(db, hl.client(), A, T0 + H);
    const stored = await allFills(db, 2);
    expect(stored.map((f) => f.tid).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("round-trips cursors and rejects junk", () => {
    expect(decodeCursor(encodeCursor({ time: 5, id: "1-0xab" }))).toEqual({ time: 5, id: "1-0xab" });
    expect(decodeCursor("nope")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });
});

describe("idle worker", () => {
  it("sleeps until the next wallet is due, within limits", () => {
    expect(idleWait(null, T0)).toBe(IDLE_WAIT_MAX);
    expect(idleWait(T0 + 3 * 60_000, T0)).toBe(3 * 60_000);
    expect(idleWait(T0 + 6 * H, T0)).toBe(IDLE_WAIT_MAX);
    expect(idleWait(T0 - 5_000, T0)).toBe(1_000); // overdue: look again almost at once
  });

  it("knows when the next wallet is due", async () => {
    const db = await testDb();
    expect(await nextDueAt(db)).toBeNull();
    await trackWallet(db, A, T0);
    await trackWallet(db, "0x" + "b".repeat(40), T0 - 60_000);
    expect(await nextDueAt(db)).toBe(T0 - 60_000);
  });
});

describe("very active wallets", () => {
  it("paging says when it stopped at the page limit instead of the end", async () => {
    const hl = new FakeHyperliquid(10_000, 2);
    for (let i = 0; i < 7; i++) hl.trade(T0 + i, i % 2 ? "sell" : "buy", 1);
    expect((await hl.client().fills(A, 0, 2)).complete).toBe(false);
    const all = await hl.client().fills(A, 0, 20);
    expect(all.complete).toBe(true);
    expect(all.rows).toHaveLength(7);
  });

  it("comes back soon when a sync stopped early, and stops for a day at the per-wallet cap", async () => {
    const db = await testDb();
    const hl = new FakeHyperliquid(10_000, 2); // 2 fills per page
    for (let i = 0; i < 10; i++) hl.trade(T0 + i * 1000, i % 2 ? "sell" : "buy", 1);
    await trackWallet(db, A, T0);

    const first = await syncWallet(db, hl.client(), A, T0 + H, 3);
    expect(first).toMatchObject({ newFills: 2, complete: false, nextSyncAt: T0 + H + 10 * 60_000 });

    await syncWallet(db, hl.client(), A, T0 + 2 * H, 3);
    const capped = await syncWallet(db, hl.client(), A, T0 + 3 * H, 3);
    expect(capped).toMatchObject({ newFills: 0, capped: true, nextSyncAt: T0 + 3 * H + 24 * H });
    expect((await allFills(db)).length).toBe(3);
    expect((await getWallet(db, A))?.syncError).toMatch(/more fills than perpbook saves/);
  });
});

describe("loading progress", () => {
  it("reports the running count after each page", async () => {
    const hl = new FakeHyperliquid(10_000, 2);
    for (let i = 0; i < 5; i++) hl.trade(T0 + i, i % 2 ? "sell" : "buy", 1);
    const seen: number[] = [];
    await hl.client().fills(A, 0, 20, (n) => seen.push(n));
    // Pages overlap by a fill (each starts at the last one's timestamp), so the count only ever grows.
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.at(-1)).toBe(5);
  });
});
