import type { Db } from "./db";

// Append only: never edit a migration that has shipped. Kept in code rather than .sql
// files so the worker, the API routes and tests all get them without file access.
const MIGRATIONS: string[] = [
  /* 1: wallets, fills, funding, gaps */ `
  create table wallets (
    address           text primary key,
    tracked_since     timestamptz not null default now(),
    last_fill_time    bigint,
    last_funding_time bigint,
    fills_per_hour    real not null default 0,
    next_sync_at      timestamptz not null default now(),
    last_synced_at    timestamptz,
    last_viewed_at    timestamptz,
    sync_error        text
  );
  create index wallets_next_sync_at on wallets (next_sync_at);

  -- Raw Hyperliquid rows; normalised at read time so engine fixes apply to old history.
  create table fills (
    address text   not null references wallets on delete cascade,
    id      text   not null,
    coin    text   not null,
    time    bigint not null,
    raw     jsonb  not null,
    primary key (address, id)
  );
  create index fills_address_time on fills (address, time, id);

  create table funding (
    address text   not null references wallets on delete cascade,
    id      text   not null,
    coin    text   not null,
    time    bigint not null,
    raw     jsonb  not null,
    primary key (address, id)
  );
  create index funding_address_time on funding (address, time, id);

  -- Stretches where we know fills are missing, e.g. >10,000 fills between two syncs.
  create table history_gaps (
    address   text   not null references wallets on delete cascade,
    from_time bigint not null,
    to_time   bigint not null,
    found_at  timestamptz not null default now()
  );
  create index history_gaps_address on history_gaps (address);

  -- Who asked to track what, for the per-IP limit while there are no accounts.
  create table track_requests (
    ip      text        not null,
    address text        not null,
    at      timestamptz not null default now()
  );
  create index track_requests_ip_at on track_requests (ip, at);
  `,
  /* 2: TWAP slices, which syncs before Oct 2026 never fetched. New wallets get them from their
     first sync; wallets with history need their older slices fetched once. */ `
  alter table wallets add column twap_backfilled boolean not null default true;
  update wallets set twap_backfilled = false where last_fill_time is not null;
  `,
];

/**
 * Apply any migrations this database hasn't seen, in order, in one transaction. The app
 * and the worker both migrate on start, so an advisory lock makes the second one wait.
 */
export async function migrate(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(4206917)");
    await tx.query("create table if not exists schema_migrations (version int primary key, applied_at timestamptz not null default now())");
    const { rows } = await tx.query<{ v: number | null }>("select max(version) as v from schema_migrations");
    const current = rows[0]?.v ?? 0;
    for (let v = current + 1; v <= MIGRATIONS.length; v++) {
      await tx.query(MIGRATIONS[v - 1]);
      await tx.query("insert into schema_migrations (version) values ($1)", [v]);
    }
    return MIGRATIONS.length - current;
  });
}

/**
 * Bring the schema up to date before the first query, so a release that adds a column works the
 * moment it's deployed rather than when the worker next runs. Already up to date, it's one query.
 */
export function migratedOnFirstUse(inner: Db): Db {
  let ready: Promise<unknown> | null = null;
  const first = () =>
    (ready ??= migrate(inner).catch((e) => {
      ready = null; // try again on the next request
      throw e;
    }));
  return {
    query: async (text, params) => (await first(), inner.query(text, params)),
    transaction: async (fn) => (await first(), inner.transaction(fn)),
  };
}
