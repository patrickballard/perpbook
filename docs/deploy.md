# Deploying perpbook with permanent history

The hosted setup has three pieces, all in US East so they're close to each other:

| Piece | Where | Cost to start |
|---|---|---|
| App | Vercel (default region `iad1`) | Free |
| Database | [Neon](https://neon.com) Postgres, region AWS US East (N. Virginia) | Free plan |
| Sync worker | A small VPS with its own public IPv4, e.g. Hetzner Cloud in Ashburn | About €4–5 a month; check the current price |

Without a database, perpbook still works: it reads everything live from Hyperliquid, and the "Keep my history" button doesn't appear.

## Why the worker gets its own server

Hyperliquid's rate limit is per IP address: 1,200 weight a minute, shared by everything on that address. The worker is built to stay inside it, but only if nothing else is spending the same budget. Platforms that send outbound traffic from shared, NAT'd addresses (Fly.io and Railway by default) put other people's apps on your budget, and the worker hits `429`s that aren't its fault. Static outbound IPs are a paid add-on there, and traffic can still leave over IPv6. A VPS has its own address, so it's simpler.

The worker also shouldn't run as a Vercel Cron job: the free plan only runs cron once a day, functions have time limits, and Vercel's outbound addresses change.

## 1. Database: Neon

The quickest route is from inside Vercel, with no separate Neon signup: open the perpbook project, go to **Storage**, create a **Neon** database in a US East (Washington, D.C. / `iad1`) region, and connect it to the project. Vercel then adds the connection strings to the project's environment variables itself. Otherwise, from Neon directly:

1. Create a Neon project in **AWS US East (N. Virginia)**.
2. In Vercel, open the project's **Integrations** and add **Neon**, linked to that project. The integration adds the connection strings to Vercel's environment variables. Check that `DATABASE_URL` is among them; if it has a different name, add `DATABASE_URL` yourself with Neon's **pooled** connection string (the host contains `-pooler`).
3. Keep Neon's **direct** connection string (no `-pooler`) for the worker. With the Vercel route, it's the variable whose name ends in `UNPOOLED`, or on the database's page in Neon's console.

You don't need to create any tables: the worker runs the migrations when it starts.

## 2. Sync worker: a VPS

Create the smallest server with a public IPv4 on Ubuntu 24.04, in a US East location. The worker uses very little CPU or memory. The only inbound port it needs is SSH; if your provider has a firewall, allow port 22 and nothing else.

**Quickest:** copy [`deploy/cloud-init.yaml`](../deploy/cloud-init.yaml), replace its one placeholder line with Neon's direct connection string, and paste it into the **Cloud config** (Hetzner) or **User data** box when you create the server. The server installs Docker, fetches perpbook and starts the worker on its own, in a few minutes. The connection string is kept in your provider's server metadata, as anything in that box is; if you'd rather not, use the manual steps below.

**Or by hand**, on the server:

```bash
apt update && apt install -y docker.io docker-compose-v2 git
git clone https://github.com/patrickballard/perpbook.git
cd perpbook
printf 'DATABASE_URL=%s\n' 'postgres://…direct Neon connection string…' > .env
chmod 600 .env
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml logs -f
```

The logs should show `migrated` (first start only) and then `worker started`. Each sync logs a `synced` line with the number of new fills and funding payments, and when the wallet is due next.

To update after new commits land on `main`:

```bash
cd perpbook && git pull && docker compose -f docker-compose.worker.yml up -d --build
```

The container restarts on its own after crashes and reboots (`restart: unless-stopped`).

## 3. App: Vercel

1. Make sure `DATABASE_URL` is set for the **Production** environment (and Preview, if you want previews to save history too).
2. Redeploy, so the running app picks up the variable.
3. Optionally set `TRACK_PER_IP_PER_DAY` (default 3) and `MAX_TRACKED_WALLETS` (default 2,000), the limits on who can start saving wallets while there are no accounts.

## Check it works

1. `curl https://perpbook.vercel.app/api/w/<any wallet address>` should return `{"state":"untracked"}`. Before the database was set up it returned `{"state":"off"}`.
2. Open that wallet's page and press **Keep my history**. The header changes to "history saved since …".
3. Within 10 minutes the worker logs `synced` for it. A first sync of a very active wallet can take a minute or two, because the worker spaces out its requests to stay inside the rate limit.
4. Reload the page: it now loads saved history from perpbook, then only newer fills from Hyperliquid.

## Costs as it grows

- **Neon's free plan** includes 0.5 GB of storage per project (roughly a million fills) and 100 compute-hours a month. Neon suspends the database after 5 minutes without queries, and the worker sleeps until the next wallet is due rather than checking constantly. So with a handful of saved wallets the database is asleep most of the time. With many wallets it stays busy, and Neon's paid plan bills by usage.
- **One worker** keeps about 1,200 wallets synced hourly. For more, run a second worker on another server with a different IP address. Workers share the database safely: each wallet is claimed by one worker at a time.

## Backups

Neon's free plan can restore the database to any point in the last 6 hours. Paid plans keep a longer history. Everything stored is also public on Hyperliquid for as long as it serves it, but older fills can't be fetched again once they've dropped out of Hyperliquid's 10,000-fill window, so the database is the only copy of those.
