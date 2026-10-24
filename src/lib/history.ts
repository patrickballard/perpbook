// Browser side of stored history: talks to /api/w/[address] and merges with live data.

import type { HistoryPage, WalletStatus } from "./sync/api";
import type { Fill, FundingEvent } from "./hyperliquid/types";

/** off: this deployment has no database. untracked: it does, but this wallet isn't saved yet. */
export type Storage = { state: "off" } | { state: "untracked" } | { state: "tracked"; status: WalletStatus };

type FetchLike = typeof fetch;

export async function getStorage(address: string, f: FetchLike = fetch): Promise<Storage> {
  try {
    const r = await f(`/api/w/${address}`, { cache: "no-store" });
    if (r.status === 404) return { state: "untracked" };
    if (!r.ok) return { state: "off" };
    return { state: "tracked", status: (await r.json()) as WalletStatus };
  } catch {
    return { state: "off" };
  }
}

async function allPages<T>(address: string, kind: "fills" | "funding", f: FetchLike): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  do {
    const q: string = after ? `&after=${encodeURIComponent(after)}` : "";
    const r = await f(`/api/w/${address}/history?kind=${kind}${q}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Couldn't load saved history (${r.status})`);
    const page = (await r.json()) as HistoryPage;
    out.push(...(page.rows as T[]));
    after = page.next;
  } while (after);
  return out;
}

export async function getStoredHistory(address: string, f: FetchLike = fetch) {
  const [fills, funding] = await Promise.all([allPages<Fill>(address, "fills", f), allPages<FundingEvent>(address, "funding", f)]);
  return { fills, funding };
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
