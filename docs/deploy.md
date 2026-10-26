# Deploying perpbook with permanent history

The hosted setup costs nothing:

| Piece | Where | Cost |
|---|---|---|
| App | Vercel (default region `iad1`) | Free plan |
| Database | [Neon](https://neon.com) Postgres, created from Vercel, US East | Free plan |
| Sync worker | A scheduled GitHub Actions job ([`sync.yml`](../.github/workflows/sync.yml)) every half hour | Free for public repositories |

Without a database, perpbook still works: it reads everything live from Hyperliquid, and the "Keep my history" button doesn't appear.

## Setup

### 1. Create the database (Vercel)

1. On vercel.com, open the **perpbook** project and go to the **Storage** tab.
2. Click **Create Database** and choose **Neon**. Accept Neon's terms, pick the **Washington, D.C. (iad1)** region and the **Free** plan, and create it.
3. Connect it to the **perpbook** project, with all environments ticked. Vercel adds the connection strings to the project's environment variables itself, including `DATABASE_URL`.
4. On the new database's page, find the connection string named **`DATABASE_URL_UNPOOLED`** (no `-pooler` in its host) and copy it for step 2. It contains the database password, so keep it private.
5. Go to **Deployments**, open the **⋯** menu on the latest deployment and click **Redeploy**, so the app picks up the database.

You don't need to create any tables: the worker runs the migrations when it starts.

### 2. Turn on the sync job (GitHub)

1. On GitHub, open the repository's **Settings → Secrets and variables → Actions** and click **New repository secret**.
2. Name it `DATABASE_URL`, paste the connection string from step 1.4, and save.
3. Go to the **Actions** tab, choose **Sync wallets** and click **Run workflow** to start the first run now rather than waiting for the schedule.

From then on it runs every half hour on its own. GitHub hides secrets in the logs, and the job prints totals only (wallets synced, new fills), never wallet addresses, because Actions logs on a public repository are public.

### 3. Check it works

1. `curl https://perpbook.vercel.app/api/w/<any wallet address>` should return `{"state":"untracked"}`. Before the database existed it returned `{"state":"off"}`.
2. Open that wallet's page and press **Keep my history**. The header changes to "history saved since …".
3. Run **Sync wallets** again (or wait for the next scheduled run). Its log ends with a `worker stopped` line showing `"synced":1` and the number of new fills.
4. Reload the wallet's page: it now loads saved history from perpbook, then only newer fills from Hyperliquid.

## What to know about the free setup

- **Timing.** GitHub starts scheduled jobs late, or skips them, when it's busy. On this repository it has been running the job about every 6 hours rather than every 30 minutes. That's fine for now: the dashboard always shows live data on top of what's saved. If it ever matters, a free external scheduler can trigger the job on time.
- **Rate limits.** Hyperliquid's limit is per IP address. Every run gets a fresh GitHub machine, so the worker has the limit to itself, and it stays under it with its built-in budget.
- **Inactivity.** GitHub pauses scheduled jobs in a public repository after 60 days without commits. If that happens, GitHub emails you; re-enable it from the **Actions** tab.
- **Neon's free plan** includes 0.5 GB of storage (roughly a million fills) and 100 compute-hours a month. Neon suspends the database after 5 minutes without queries, so between runs it's asleep. With a run every half hour that's roughly half the free hours.
- **Capacity.** Each run spends up to 20 minutes syncing; anything left waits for the next run. That covers several hundred saved wallets synced about hourly.

## When you outgrow it: a server for the worker

If syncs need to be punctual, or there are more wallets than the scheduled job gets through, run the worker continuously on a small server instead (about $5 a month). It needs its own public IPv4: platforms that send outbound traffic from shared addresses (Fly.io and Railway by default) put other people's apps on your Hyperliquid rate limit. Turn off the GitHub job when you switch (**Actions → Sync wallets → ⋯ → Disable workflow**), or keep both: they share the database safely, and each wallet is claimed by one worker at a time.

Create the smallest Ubuntu 24.04 server with a public IPv4 in a US East location (e.g. Hetzner, Ashburn). The only inbound port it needs is SSH.

**Quickest:** copy [`deploy/cloud-init.yaml`](../deploy/cloud-init.yaml), replace its one placeholder line with the `DATABASE_URL_UNPOOLED` connection string, and paste it into the **Cloud config** (Hetzner) or **User data** box when you create the server. It installs Docker, fetches perpbook and starts the worker on its own. The connection string is kept in your provider's server metadata, as anything in that box is; if you'd rather not, use the manual steps below.

**Or by hand**, on the server:

```bash
apt update && apt install -y docker.io docker-compose-v2 git
git clone https://github.com/patrickballard/perpbook.git
cd perpbook
printf 'DATABASE_URL=%s\n' 'postgres://…unpooled connection string…' > .env
chmod 600 .env
docker compose -f docker-compose.worker.yml up -d --build
docker compose -f docker-compose.worker.yml logs -f
```

The logs show `worker started`, then a `synced` line per wallet. To update after new commits land on `main`:

```bash
cd perpbook && git pull && docker compose -f docker-compose.worker.yml up -d --build
```

The container restarts on its own after crashes and reboots. One server keeps about 1,200 wallets synced hourly; for more, add a second server with a different IP address.

## Optional settings (Vercel environment variables)

- `TRACK_PER_IP_PER_DAY` (default 3) and `MAX_TRACKED_WALLETS` (default 2,000): limits on who can start saving wallets while there are no accounts.

## Backups

Neon's free plan can restore the database to any point in the last 6 hours; paid plans keep a longer history. Hyperliquid's API only promises a wallet's latest 10,000 fills (older ones were still served in October 2026); if that changes, the database is the only copy of the rest.
