import type { HlFill, HlFunding } from "../hyperliquid/types";
import { fillId, fundingId } from "../hyperliquid/normalise";
import type { Db } from "./db";

export type Wallet = {
  address: string;
  trackedSince: number;
  lastFillTime: number | null;
  lastFundingTime: number | null;
  fillsPerHour: number;
  nextSyncAt: number;
  lastSyncedAt: number | null;
  lastViewedAt: number | null;
  syncError: string | null;
  /** Whether TWAP slices from before Oct 2026 (when syncs started fetching them) are stored. */
  twapBackfilled: boolean;
};

export type Gap = { fromTime: number; toTime: number };

// bigint columns come back as strings from pg; ms timestamps fit a float8 exactly.
const WALLET_COLS = `address,
  extract(epoch from tracked_since) * 1000 as "trackedSince",
  last_fill_time::float8 as "lastFillTime",
  last_funding_time::float8 as "lastFundingTime",
  fills_per_hour::float8 as "fillsPerHour",
  extract(epoch from next_sync_at) * 1000 as "nextSyncAt",
  extract(epoch from last_synced_at) * 1000 as "lastSyncedAt",
  extract(epoch from last_viewed_at) * 1000 as "lastViewedAt",
  sync_error as "syncError",
  twap_backfilled as "twapBackfilled"`;

const ts = "to_timestamp($1::float8 / 1000)";

const toWallet = (r: Record<string, unknown>): Wallet => {
  const n = (x: unknown) => (x == null ? null : Number(x));
  return {
    address: String(r.address),
    trackedSince: Number(r.trackedSince),
    lastFillTime: n(r.lastFillTime),
    lastFundingTime: n(r.lastFundingTime),
    fillsPerHour: Number(r.fillsPerHour),
    nextSyncAt: Number(r.nextSyncAt),
    lastSyncedAt: n(r.lastSyncedAt),
    lastViewedAt: n(r.lastViewedAt),
    syncError: (r.syncError as string | null) ?? null,
    twapBackfilled: Boolean(r.twapBackfilled),
  };
};

export async function getWallet(db: Db, address: string): Promise<Wallet | null> {
  const { rows } = await db.query(`select ${WALLET_COLS} from wallets where address = $1`, [address]);
  return rows[0] ? toWallet(rows[0]) : null;
}

/** Start tracking a wallet, due for its first sync now. Returns false if it was already tracked. */
export async function trackWallet(db: Db, address: string, now = Date.now()): Promise<boolean> {
  const { rows } = await db.query(
    `insert into wallets (address, tracked_since, next_sync_at) values ($2, ${ts}, ${ts})
     on conflict (address) do nothing returning address`,
    [now, address],
  );
  return rows.length > 0;
}

export async function countWallets(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from wallets");
  return rows[0].n;
}

/** Log a track request and return how many this IP has made in the last day, including it. */
export async function logTrackRequest(db: Db, ip: string, address: string, now = Date.now()): Promise<number> {
  await db.query(`insert into track_requests (ip, address, at) values ($2, $3, ${ts})`, [now, ip, address]);
  const { rows } = await db.query<{ n: number }>(
    `select count(distinct address)::int as n from track_requests where ip = $2 and at > ${ts} - interval '1 day'`,
    [now, ip],
  );
  return rows[0].n;
}

export async function touchWallet(db: Db, address: string, now = Date.now()) {
  await db.query(`update wallets set last_viewed_at = ${ts} where address = $2`, [now, address]);
}

const CHUNK = 2_000;

async function insertRows(db: Db, table: "fills" | "funding", address: string, rows: { id: string; coin: string; time: number; raw: unknown }[]) {
  let added = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const r = await db.query(
      `insert into ${table} (address, id, coin, time, raw)
       select $1, e->>'id', e->>'coin', (e->>'time')::bigint, e->'raw' from jsonb_array_elements($2::jsonb) e
       on conflict do nothing returning 1`,
      [address, JSON.stringify(rows.slice(i, i + CHUNK))],
    );
    added += r.rows.length;
  }
  return added;
}

export const insertFills = (db: Db, address: string, fills: HlFill[]) =>
  insertRows(db, "fills", address, fills.map((f) => ({ id: fillId(f), coin: f.coin, time: f.time, raw: f })));

export const insertFunding = (db: Db, address: string, funding: HlFunding[]) =>
  insertRows(db, "funding", address, funding.map((f) => ({ id: fundingId(f), coin: f.delta?.coin ?? "", time: f.time, raw: f })));

export async function countFills(db: Db, address: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from fills where address = $1", [address]);
  return rows[0].n;
}

export async function recordGap(db: Db, address: string, gap: Gap) {
  await db.query("insert into history_gaps (address, from_time, to_time) values ($1, $2, $3)", [address, gap.fromTime, gap.toTime]);
}

export async function getGaps(db: Db, address: string): Promise<Gap[]> {
  const { rows } = await db.query<Gap>(
    `select from_time::float8 as "fromTime", to_time::float8 as "toTime" from history_gaps where address = $1 order by from_time`,
    [address],
  );
  return rows.map((g) => ({ fromTime: Number(g.fromTime), toTime: Number(g.toTime) }));
}

export async function finishSync(
  db: Db,
  address: string,
  s: { lastFillTime: number | null; lastFundingTime: number | null; fillsPerHour: number; nextSyncAt: number; now: number },
) {
  await db.query(
    `update wallets set last_fill_time = $2, last_funding_time = $3, fills_per_hour = $4,
       next_sync_at = to_timestamp($5::float8 / 1000), last_synced_at = to_timestamp($6::float8 / 1000), sync_error = null
     where address = $1`,
    [address, s.lastFillTime, s.lastFundingTime, s.fillsPerHour, s.nextSyncAt, s.now],
  );
}

export async function markTwapBackfilled(db: Db, address: string) {
  await db.query("update wallets set twap_backfilled = true where address = $1", [address]);
}

export async function failSync(db: Db, address: string, error: string, retryAt: number) {
  await db.query(`update wallets set sync_error = $2, next_sync_at = to_timestamp($3::float8 / 1000) where address = $1`, [
    address,
    error.slice(0, 500),
    retryAt,
  ]);
}

/**
 * Claim the most overdue wallet by pushing its next sync out by a lease. If the worker
 * dies mid-sync, the wallet comes due again when the lease runs out. `skip locked` lets
 * several workers share one database without syncing the same wallet twice.
 */
export async function claimDueWallet(db: Db, now = Date.now(), leaseMs = 10 * 60_000): Promise<string | null> {
  const { rows } = await db.query<{ address: string }>(
    `update wallets set next_sync_at = to_timestamp(($1::float8 + $2::float8) / 1000)
     where address = (
       select address from wallets where next_sync_at <= ${ts}
       order by next_sync_at limit 1 for update skip locked
     ) returning address`,
    [now, leaseMs],
  );
  return rows[0]?.address ?? null;
}

export type Cursor = { time: number; id: string };
export const encodeCursor = (c: Cursor) => `${c.time}:${c.id}`;
export function decodeCursor(s: string | null | undefined): Cursor | null {
  const i = s?.indexOf(":") ?? -1;
  if (!s || i < 1) return null;
  const time = Number(s.slice(0, i));
  return Number.isFinite(time) ? { time, id: s.slice(i + 1) } : null;
}

/** One page of stored raw rows, oldest first, after `cursor`. */
export async function historyPage<T>(
  db: Db,
  table: "fills" | "funding",
  address: string,
  cursor: Cursor | null,
  limit = 5_000,
): Promise<{ rows: T[]; next: Cursor | null }> {
  const c = cursor ?? { time: -1, id: "" };
  const { rows } = await db.query<{ raw: T; time: number; id: string }>(
    `select raw, time::float8 as time, id from ${table}
     where address = $1 and (time, id) > ($2::bigint, $3) order by time, id limit $4`,
    [address, c.time, c.id, limit],
  );
  const last = rows.at(-1);
  return { rows: rows.map((r) => r.raw), next: rows.length === limit && last ? { time: Number(last.time), id: last.id } : null };
}

/** When the next wallet comes due (ms), or null if nothing is tracked. */
export async function nextDueAt(db: Db): Promise<number | null> {
  const { rows } = await db.query<{ at: number | null }>("select extract(epoch from min(next_sync_at)) * 1000 as at from wallets");
  return rows[0]?.at == null ? null : Number(rows[0].at);
}
