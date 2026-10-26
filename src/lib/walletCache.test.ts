import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserStore, CACHE_VERSION, CACHE_WALLETS, memoryStore, writeCache, type CachedWallet } from "./walletCache";

const wallet = (savedAt: number): CachedWallet => ({ version: CACHE_VERSION, fills: [], funding: [], savedAt });
const addr = (i: number) => "0x" + i.toString(16).padStart(40, "0");

describe("memoryStore and writeCache", () => {
  afterEach(() => vi.useRealTimers());

  it(`keeps the ${CACHE_WALLETS} wallets saved most recently`, async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    for (let i = 0; i <= CACHE_WALLETS; i++) {
      vi.setSystemTime(1_000 + i);
      await writeCache(store, addr(i), [], []);
    }
    expect(await store.get(addr(0))).toBeNull();
    expect(await store.get(addr(1))).not.toBeNull();
    expect(await store.get(addr(CACHE_WALLETS))).not.toBeNull();
  });
});

describe("browserStore (IndexedDB)", () => {
  beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
  afterEach(() => vi.unstubAllGlobals());

  it("saves, reads back and drops the oldest wallets", async () => {
    const store = browserStore()!;
    await store.set(addr(1), wallet(30));
    await store.set(addr(2), wallet(10));
    await store.set(addr(3), wallet(20));
    await store.prune(2);
    expect(await store.get(addr(2))).toBeNull();
    expect(await store.get(addr(1))).toEqual(wallet(30));
    expect(await store.get(addr(3))).toEqual(wallet(20));
  });

  it("does nothing when there are fewer wallets than the limit", async () => {
    const store = browserStore()!;
    await store.set(addr(1), wallet(1));
    await store.prune(2);
    expect(await store.get(addr(1))).toEqual(wallet(1));
  });

  it("keeps wallets saved before the limit existed", async () => {
    // The database as the previous release created it: version 1, no index.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("perpbook", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("wallets").put(wallet(5), addr(1));
      req.onsuccess = () => (req.result.close(), resolve());
      req.onerror = () => reject(req.error);
    });
    const store = browserStore()!;
    expect(await store.get(addr(1))).toEqual(wallet(5));
    await store.set(addr(2), wallet(6));
    await store.prune(1);
    expect(await store.get(addr(1))).toBeNull();
    expect(await store.get(addr(2))).toEqual(wallet(6));
  });
});
