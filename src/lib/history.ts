// Browser side of stored history: talks to /api/w/[address] and merges with live data.

import type { HistoryPage, StorageState } from "./sync/api";
import type { Fill, FundingEvent } from "./hyperliquid/types";

export type Storage = StorageState;

type FetchLike = typeof fetch;

export async function getStorage(address: string, f: FetchLike = fetch): Promise<Storage> {
  try {
    const r = await f(`/api/w/${address}`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as Storage) : { state: "off" };
  } catch {
    return { state: "off" };
  }
}

/** Saved rows per kind the browser loads: 10 pages of 5,000. More would be slow to download and rebuild. */
const STORED_PAGES = 10;

async function allPages<T>(address: string, kind: "fills" | "funding", f: FetchLike, onProgress?: (rows: number) => void): Promise<{ rows: T[]; complete: boolean }> {
  const out: T[] = [];
  let after: string | null = null;
  let pages = 0;
  do {
    if (pages++ === STORED_PAGES) return { rows: out, complete: false };
    const q: string = after ? `&after=${encodeURIComponent(after)}` : "";
    const r = await f(`/api/w/${address}/history?kind=${kind}${q}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Couldn't load saved history (${r.status})`);
    const page = (await r.json()) as HistoryPage;
    out.push(...(page.rows as T[]));
    onProgress?.(out.length);
    after = page.next;
  } while (after);
  return { rows: out, complete: true };
}

export async function getStoredHistory(address: string, f: FetchLike = fetch, onProgress?: (fills: number) => void) {
  const [fills, funding] = await Promise.all([allPages<Fill>(address, "fills", f, onProgress), allPages<FundingEvent>(address, "funding", f)]);
  return { fills: fills.rows, funding: funding.rows, complete: fills.complete && funding.complete };
}

/** Start saving this wallet's history. Resolves to an error message, or null on success. */
export async function requestTracking(address: string, f: FetchLike = fetch): Promise<string | null> {
  try {
    const r = await f(`/api/w/${address}/track`, { method: "POST" });
    if (r.ok) return null;
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? `Couldn't start saving history (${r.status})`;
  } catch {
    return "Couldn't reach perpbook. Try again in a moment.";
  }
}

/** Stored rows plus whatever Hyperliquid has that's newer; rows in both are kept once. */
export function mergeById<T extends { id: string; time: number }>(stored: T[], live: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of stored) m.set(x.id, x);
  for (const x of live) m.set(x.id, x);
  return [...m.values()].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export const lastTime = (rows: { time: number }[]) => (rows.length ? rows[rows.length - 1].time : null);
