# Permanent history: storage and a sync worker

Status: proposal · October 2026

## Why this comes first

Hyperliquid only serves a wallet's most recent 10,000 fills. A live account we tested had 7,800 fills from four weeks of trading, so for active traders history falls off every day, and once it's gone nobody can get it back. The traders who hit the cap are also the ones most likely to pay. Storing fills is therefore three things at once: a fix for silent data loss, the reason to come back, and the basis for a paid plan.

Goal of the first milestone: **once a wallet is tracked, perpbook never loses one of its fills or funding payments again**, on the hosted version and on a self-hosted one.

## What Hyperliquid allows

From the [rate limit docs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits) and probing the live API:

| | |
|---|---|
| Budget | 1,200 weight per minute **per IP**, shared by all REST requests |
| `userFillsByTime`, `userFunding` | 20 weight per request, plus 1 per 20 items returned |
| `clearinghouseState` | 2 |
| Page size | `userFillsByTime` returns at most 2,000 fills per page, oldest first from `startTime` |
| History | Only the 10,000 most recent fills; funding goes back further |
| WebSocket | At most 10 distinct users per IP across user subscriptions, so it can't follow many wallets |

What that means in practice:

- **A first full sync is expensive.** The test account (7.8k fills, 15k funding events) cost about 1,300 weight, more than one IP's whole budget for a minute. Today the browser does this on every refresh, so heavy wallets can already hit `429`s just from clicking Refresh twice.
- **An incremental sync is cheap.** One fills request and one funding request from the last stored time, plus positions, is about 45–60 weight. One IP can do roughly 20–25 of these a minute, about 30,000 a day: enough to sync about 1,200 wallets every hour.
- **Polling is the only option.** Because of the WebSocket limit, a server that follows many wallets has to poll.

## Overview

```
          ┌──────────── browser ────────────┐
          │ /w/[address]                    │
          │  1. GET stored history (ours)   │
          │  2. fetch the delta from HL     │──────┐
          └───────────────┬─────────────────┘      │
                          │                        ▼
                 Next.js API routes         api.hyperliquid.xyz
                          │                        ▲
                       Postgres ◀── sync worker ───┘
                                    (polls tracked wallets)
```

- **Postgres** holds the raw rows for tracked wallets.
- **The sync worker** is a long-running Node process that keeps every tracked wallet up to date within its budget.
- **The dashboard** loads stored history from our API, then fetches only what's newer straight from Hyperliquid, so it stays live without loading our servers. Untracked wallets work exactly as they do today.
- **The engine doesn't change.** It still takes `Fill[]` and `FundingEvent[]`; only where they come from changes.

## Data model

Store Hyperliquid's raw rows as `jsonb` next to a few indexed columns. Normalisation stays in `normalise.ts` and runs at read time, so a later fix to normalisation (like the same-millisecond ordering fix) automatically applies to all stored history. Numbers stay as Hyperliquid's exact decimal strings.

```sql
create table wallets (
  address          text primary key,           -- lowercase 0x…
  tracked_since    timestamptz not null default now(),
  last_fill_time   bigint,                     -- ms; cursor for the next fills request
  last_funding_time bigint,                    -- ms; cursor for the next funding request
  fills_per_hour   real not null default 0,    -- smoothed average; sets the sync interval
  next_sync_at     timestamptz not null default now(),
  last_synced_at   timestamptz,
  last_viewed_at   timestamptz,
  sync_error       text
);
create index on wallets (next_sync_at);

create table fills (
  address  text   not null references wallets,
  id       text   not null,                    -- `${tid}-${hash}`, same as fillId()
  coin     text   not null,
  time     bigint not null,
  raw      jsonb  not null,                    -- the HlFill exactly as received
  primary key (address, id)
);
create index on fills (address, time);

create table funding (
  address  text   not null references wallets,
  id       text   not null,                    -- same as fundingId()
  coin     text   not null,
  time     bigint not null,
  raw      jsonb  not null,
  primary key (address, id)
);
create index on funding (address, time);

-- Stretches where we know fills are missing (e.g. a wallet traded >10k fills between syncs).
create table history_gaps (
  address  text   not null references wallets,
  from_time bigint not null,
  to_time   bigint not null,
  found_at  timestamptz not null default now()
);
```

Size: a raw fill is about 350 bytes as JSON, so roughly 0.5 GB per million fills with indexes. A heavy trader at 10k fills a month is about 5 MB a month.

Accounts, wallet lists and notes come later (phase 2). Hyperliquid data is public, so storage is keyed by **address**, not by user. Several users can follow the same wallet, and we never need proof of ownership. That keeps perpbook's promise of never asking for signatures.

## Sync algorithm

`syncWallet(db, client, address)` in `src/lib/sync/`. It takes the existing `HyperliquidClient` (which already accepts a custom `fetch`), so tests can use a fake Hyperliquid.

1. **Fills.** Call `client.fills(address, last_fill_time ?? 0)`. Start *at* the last stored time, not one millisecond after, so the first row returned should be one we already have. Insert with `on conflict do nothing`.
2. **Detect gaps.** If we already had fills but the first page shares no row with what's stored, and its oldest fill is newer than our cursor, the 10,000-fill window has passed us. Record `history_gaps(last_fill_time, oldest_returned)`. The numbers stay correct regardless, because the engine's `startPosition` check marks the affected trade partial. The gap row lets the dashboard tell the user *when* history is missing.
3. **Funding.** Same approach from `last_funding_time`. On the first sync, start funding at the oldest fill we have; funding older than that can't be matched to any trade.
4. **Commit.** Write the rows and the new cursors in a single transaction, so a crash leaves nothing half-done.
5. **Schedule.** Update `fills_per_hour` (weighted towards recent syncs) and set `next_sync_at`:

   ```
   interval = clamp(5,000 fills ÷ fills_per_hour, 10 min, 6 h)
   ```

   This syncs well before 10,000 new fills can pile up (aiming for half the cap leaves room for bursts). A wallet with no fills for 30 days and no views drops to a daily sync.

### Worker loop

```
loop:
  wait for the weight budget (token bucket, ~1,000 per minute, leaving headroom)
  claim one due wallet:
    select … where next_sync_at <= now() order by next_sync_at
    limit 1 for update skip locked
  syncWallet()
  on 429 or an error: back off this wallet, store sync_error, keep going
```

`skip locked` lets several workers (and several IPs) share one database later without double work. First syncs go through the same queue and simply cost more of the budget.

## Reading history

- `GET /api/w/[address]/history?after=<ms>` returns normalised fills and funding, oldest first, in pages of 5,000. Vercel caps function responses at 4.5 MB, so this has to be paginated. Send the normalised `Fill` shape rather than the raw row; it's about a third of the size.
- `useWallet` changes: if the wallet is tracked, load the stored pages, then call `client.fills(address, lastStoredTime)` and `client.funding(…)` from the browser to fetch only what's newer. `normaliseFills` already removes duplicates by id, so merging is just concatenation. Untracked wallets keep today's path.
- The 10,000-fill warning changes to "Keep my history". If the wallet has gaps, it says which dates are missing.
- `POST /api/w/[address]/track` adds the wallet with `next_sync_at = now()`. With no accounts in phase 1, limit it per IP and cap the total number of tracked wallets to control cost.

## Where it runs

Use one setup for both the hosted version and self-hosting, so the two can't drift apart.

| | Hosted | Self-hosted |
|---|---|---|
| App | Vercel, as today | `app` container (`next start`) |
| Worker | The same image on a small always-on box (Fly.io, Railway or a €5 VPS) running `npm run worker` | `worker` container, same image |
| Database | Managed Postgres (Neon or Supabase) | `postgres` container |

Why the worker shouldn't run as a Vercel Cron job: the free (Hobby) plan only runs cron once a day; functions have time limits, while a first sync can take minutes because of the rate budget; and Vercel's outgoing IPs change, which makes the per-IP budget impossible to manage. An always-on worker with one fixed IP is simple and predictable. Adding a second worker on another IP doubles capacity.

Dependencies: [`pg`](https://node-postgres.com) and plain numbered `.sql` migration files run by a short script, with no ORM. Tests run against [PGlite](https://pglite.dev), which is real Postgres compiled to WebAssembly, so CI and contributors don't need a database server. Both are reached through a small `Db` interface (`query(text, params)` plus `transaction(fn)`).

## Prerequisite: stable trade keys

Notes and tags (phase 2) attach to `Trade.key`, which is currently `coin:direction:openedAt`. Two trades on the same coin and direction that open in the same millisecond (open, close and reopen inside one block) get the same key. Change the key to `coin:direction:<id of the trade's first fill>`. Fill ids are unique, and including the direction keeps the two trades on either side of a flip apart. Ship this before notes exist, so no notes ever need migrating.

For a trade that was already open when history starts, the "first fill" is just the earliest one still available, and without storage that moves forward as the 10,000-fill window slides. Storage is what fixes this: the earliest *stored* fill never changes, so once a wallet is tracked, every key is permanent. Notes should therefore only be offered on tracked wallets.

## Milestones

**Phase 1: stop losing history** (target: one to two weeks)
- [ ] Stable trade keys, with a test that a key survives older fills being dropped
- [ ] Migrations, `syncWallet`, worker loop with the weight budget, gap recording
- [ ] Track and history API routes; `useWallet` loads stored history plus the live delta
- [ ] `docker-compose.yml` with app, worker and postgres (this also completes the "one-command self-hosting" roadmap item)
- [ ] Tests: a fake Hyperliquid that drops fills older than N, checking that a tracked wallet keeps them; gap detection; resuming after a crash between pages; all of it on PGlite, so CI needs no database service
- [ ] **Done when:** a wallet tracked on day 1 still shows its day-1 trades after it has made more than 10,000 fills since

**Phase 2: accounts and the journal**
- Email magic-link sign-in; a user follows wallets with labels
- Notes, setup tags and mistake tags keyed by the stable trade key, private to the user

**Phase 3: Pro**
- Free: one tracked wallet, recent history. Pro: unlimited wallets, full history, breakdowns by setup, AI weekly review
- Storing is cheap, so keep storing everyone's fills and limit what free users can *see*. Upgrading then unlocks history that already exists.

## Decisions needed

1. **Where the hosted worker and database run.** Proposal: Fly.io worker plus Neon Postgres.
2. **Phase-1 tracking limits without accounts.** Proposal: 3 wallets per IP per day, 2,000 tracked wallets in total until accounts exist.
3. **What free users see in phase 3.** Proposal: the last 90 days.
