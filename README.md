# perpbook

**The open-source trading journal for perp traders.** Paste a Hyperliquid wallet address and get every trade rebuilt, your real PnL after fees and funding, and where your edge actually is. No API keys, no CSVs, no manual entry.

- **Trades, not fills.** Scale in three times and out twice and it's still one trade. Flips are split into a closed trade and a new one; fees and funding go to the right trade.
- **Real PnL.** Net of fees and hourly funding, by day, by coin, long vs short, by hour and by weekday.
- **Read-only.** perpbook only reads public data for an address. It never asks for keys or signatures.
- **Yours.** AGPL-3.0. Self-host it for free, or use the hosted version.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/dashboard-dark.png">
  <img alt="perpbook dashboard on the demo account" src="docs/dashboard.png">
</picture>

Works for Hyperliquid perps, including front-ends built on it (such as Invo) and builder-deployed (HIP-3) markets.

## Try it

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and paste an address, or go to `/w/demo` for a generated sample account.

## How it works

```
src/lib/hyperliquid/   client for the public info endpoint + normalisation (spot filtered out, de-duplicated)
src/lib/engine/        trades.ts  rebuilds round trips from fills
                       stats.ts   win rate, profit factor, expectancy, breakdowns, daily PnL, equity
src/lib/db/            Postgres schema, migrations and queries for stored history
src/lib/sync/          syncWallet, the Hyperliquid weight budget, and the API logic
src/worker/            the sync worker (`npm run worker`)
src/components/        dashboard, equity chart, PnL calendar, breakdown bars, trades table
```

**Trade reconstruction.** A trade opens when a coin's position leaves zero and closes when it returns to zero. Hyperliquid reports the position size before every fill (`startPosition`), which perpbook treats as the source of truth. That also catches gaps: if the reported size disagrees with what we've tracked, the trade is closed and flagged `partial` rather than silently producing wrong numbers.

**The 10,000-fill limit.** Hyperliquid's API only exposes your most recent 10,000 fills, so very active traders see older history drop off. When perpbook has a database, a wallet can be saved with "Keep my history": a worker then stores every new fill and funding payment, and the dashboard shows stored history plus anything newer straight from Hyperliquid. If more than 10,000 fills happen between two saves, the dates that couldn't be recovered are shown. Design notes: [docs/permanent-history.md](docs/permanent-history.md).

## Self-hosting

Without a database, perpbook runs entirely in the browser (`npm run dev` above). To keep history permanently:

```bash
docker compose up -d
```

That starts Postgres, the app on <http://localhost:3000> and the sync worker. For the hosted setup (Vercel, Neon and a small server for the worker), see [docs/deploy.md](docs/deploy.md). To run them yourself instead, point `DATABASE_URL` at any Postgres and start both processes:

```bash
DATABASE_URL=postgres://… npm run migrate
DATABASE_URL=postgres://… npm start
DATABASE_URL=postgres://… npm run worker
```

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | unset | Postgres connection string. Unset turns storage off. |
| `HL_WEIGHT_PER_MINUTE` | `1000` | The worker's share of Hyperliquid's 1,200 per-IP budget. Run one worker per IP. |
| `TRACK_PER_IP_PER_DAY` | `3` | New wallets one visitor can save per day. |
| `MAX_TRACKED_WALLETS` | `2000` | Stop accepting new wallets past this. |
| `SITE_URL` | unset | Public URL, e.g. `https://perpbook.example`, so share images get absolute links. Not needed on Vercel. |

## Tests

```bash
npm test
```

The engine is covered for simple round trips, scaling in and out, flips, positions opened before the available history, missing fills, multi-coin accounts, funding attribution, spot filtering and the stats maths. Storage and sync tests run on [PGlite](https://pglite.dev) against a fake Hyperliquid, so they need no database server.

## Roadmap

- [x] Wallet sync, trade reconstruction, dashboard, PnL calendar, breakdowns
- [x] Postgres storage and a sync worker (permanent history past 10,000 fills)
- [ ] Accounts: sign in, follow several wallets
- [ ] Notes, setup tags and mistake tags on every trade; R multiples from a planned stop
- [ ] CSV import with a TradeZella preset
- [ ] One-command self-hosting with Docker Compose
- [ ] Hosted Pro plan: unlimited wallets, full history, breakdowns by setup, AI weekly review

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). New venue adapters are the most useful contribution.

## Licence

[AGPL-3.0](LICENSE). You can use, modify and self-host perpbook freely. If you offer a modified version to others as a service, you must publish your changes under the same licence.

perpbook is an analytics tool, not financial advice.
