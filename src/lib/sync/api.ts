// What the /api/w/[address] routes do, kept free of Next.js so it can be tested against PGlite.

import type { Db } from "../db/db";
import { countWallets, databaseBytes, decodeCursor, encodeCursor, getGaps, getWallet, historyPage, logTrackRequest, touchWallet, trackWallet, type Gap } from "../db/store";
import { normaliseFills, normaliseFunding } from "../hyperliquid/normalise";
import type { Fill, FundingEvent, HlFill, HlFunding } from "../hyperliquid/types";

export type ApiResult<T> = { status: number; body: T | { error: string } };

export type WalletStatus = {
  tracked: true;
  trackedSince: number;
  lastSyncedAt: number | null;
  syncError: string | null;
  gaps: Gap[];
};

/**
 * off: this deployment has no database. untracked: it does, but this wallet isn't saved yet.
 * Always a 200, so an ordinary page view never logs a failed request in the browser.
 */
export type StorageState = { state: "off" } | { state: "untracked" } | { state: "tracked"; status: WalletStatus };

export async function walletStatus(db: Db, address: string, now = Date.now()): Promise<ApiResult<StorageState>> {
  const w = await getWallet(db, address);
  if (!w) return { status: 200, body: { state: "untracked" } };
  await touchWallet(db, address, now);
  return {
    status: 200,
    body: {
      state: "tracked",
      status: { tracked: true, trackedSince: w.trackedSince, lastSyncedAt: w.lastSyncedAt, syncError: w.syncError, gaps: await getGaps(db, address) },
    },
  };
}

export type TrackLimits = { perIpPerDay: number; maxWallets: number; storageMb: number };

/** A whole number ≥ 0 from the environment, or the default: a typo mustn't quietly turn a limit off. */
function limitFrom(name: string, fallback: number, env: Record<string, string | undefined>): number {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  console.warn(`${name}=${JSON.stringify(raw)} isn't a whole number; using ${fallback}.`);
  return fallback;
}

export const trackLimits = (env: Record<string, string | undefined> = process.env): TrackLimits => ({
  perIpPerDay: limitFrom("TRACK_PER_IP_PER_DAY", 3, env),
  maxWallets: limitFrom("MAX_TRACKED_WALLETS", 2_000, env),
  storageMb: storageLimitMb(env),
});

/**
 * Stop saving at this database size. The other limits bound how many wallets are saved, not how
 * big they get: about 15 whales at the per-wallet cap would fill Neon's free 0.5 GB by themselves.
 */
export const storageLimitMb = (env: Record<string, string | undefined> = process.env) => limitFrom("STORAGE_LIMIT_MB", 400, env);
export const storageFull = async (db: Db, limitMb = storageLimitMb()) => (await databaseBytes(db)) >= limitMb * 1024 * 1024;

/**
 * Who's asking, for the per-IP limit, from a header only a trusted proxy can set. Anyone can send
 * X-Forwarded-For, so reading it on a server with no proxy in front let one visitor claim a new
 * IP per request. Vercel sets X-Real-IP itself. Behind your own proxy, name the header it sets in
 * CLIENT_IP_HEADER; for X-Forwarded-For the last entry is the one your proxy added. With neither,
 * every visitor shares one allowance: stricter, but it can't be dodged.
 */
export function clientIp(headers: Headers, env: Record<string, string | undefined> = process.env): string {
  const name = env.CLIENT_IP_HEADER?.trim() || (env.VERCEL === "1" ? "x-real-ip" : "");
  const value = name ? headers.get(name) : null;
  return value?.split(",").at(-1)?.trim() || "unknown";
}

/** Until there are accounts, anyone can ask us to keep a wallet's history; these limits bound the cost. */
export async function trackRequest(db: Db, address: string, ip: string, limits: TrackLimits, now = Date.now()): Promise<ApiResult<{ tracked: true; created: boolean }>> {
  if (await getWallet(db, address)) return { status: 200, body: { tracked: true, created: false } };
  if ((await logTrackRequest(db, ip, address, now)) > limits.perIpPerDay) {
    return { status: 429, body: { error: `You can start tracking ${limits.perIpPerDay} wallets a day. Try again tomorrow.` } };
  }
  if ((await countWallets(db)) >= limits.maxWallets || (await storageFull(db, limits.storageMb))) {
    return { status: 503, body: { error: "perpbook is saving as many wallets as it can for now. The dashboard still loads live from Hyperliquid." } };
  }
  const created = await trackWallet(db, address, now);
  return { status: created ? 201 : 200, body: { tracked: true, created } };
}

export type HistoryPage = { rows: Fill[] | FundingEvent[]; next: string | null };

export async function historyRequest(db: Db, address: string, kind: string | null, after: string | null): Promise<ApiResult<HistoryPage>> {
  if (kind !== "fills" && kind !== "funding") return { status: 400, body: { error: "kind must be fills or funding" } };
  if (!(await getWallet(db, address))) return { status: 404, body: { error: "not tracked" } };
  const cursor = decodeCursor(after);
  if (kind === "fills") {
    const p = await historyPage<HlFill>(db, "fills", address, cursor);
    return { status: 200, body: { rows: normaliseFills(p.rows), next: p.next && encodeCursor(p.next) } };
  }
  const p = await historyPage<HlFunding>(db, "funding", address, cursor);
  return { status: 200, body: { rows: normaliseFunding(p.rows), next: p.next && encodeCursor(p.next) } };
}
