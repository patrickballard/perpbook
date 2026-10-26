// A copy of each wallet's fills and funding in the visitor's own browser (IndexedDB), so a
// repeat visit only fetches what's new from Hyperliquid instead of the whole history again.
// It's public data, never leaves the browser, and every failure just means "no cache".

import type { Fill, FundingEvent } from "./hyperliquid/types";

/** Bump when normalised fills or funding change shape, so old copies are ignored. */
export const CACHE_VERSION = 1;

export type CachedWallet = { version: number; fills: Fill[]; funding: FundingEvent[]; savedAt: number };

export type CacheStore = {
  get(address: string): Promise<CachedWallet | null>;
  set(address: string, value: CachedWallet): Promise<void>;
};

export async function readCache(store: CacheStore | null, address: string): Promise<CachedWallet | null> {
  try {
    const c = await store?.get(address);
    return c && c.version === CACHE_VERSION && Array.isArray(c.fills) && Array.isArray(c.funding) ? c : null;
  } catch {
    return null;
  }
}

export async function writeCache(store: CacheStore | null, address: string, fills: Fill[], funding: FundingEvent[]) {
  try {
    await store?.set(address, { version: CACHE_VERSION, fills, funding, savedAt: Date.now() });
  } catch {
    // Full storage, private browsing, blocked IndexedDB: the next visit simply loads everything.
  }
}

export function memoryStore(): CacheStore {
  const m = new Map<string, CachedWallet>();
  return { get: async (a) => m.get(a) ?? null, set: async (a, v) => void m.set(a, v) };
}

const DB = "perpbook";
const STORE = "wallets";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }).finally(() => db.close()),
  );
}

/** The browser's IndexedDB, or null where there isn't one (server rendering, old browsers). */
export function browserStore(): CacheStore | null {
  if (typeof indexedDB === "undefined") return null;
  return {
    get: (a) => run<CachedWallet | undefined>("readonly", (s) => s.get(a)).then((v) => v ?? null),
    set: (a, v) => run<IDBValidKey>("readwrite", (s) => s.put(v, a)).then(() => undefined),
  };
}
