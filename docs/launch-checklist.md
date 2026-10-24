# Launch checklist

Everything between today's v0.1 and perpbook having real users who pay. Ordered by priority. 👤 marks items only the maintainer can do (accounts, money, posting as perpbook, legal); everything else can land as a pull request.

## 1. Numbers people can trust

- [ ] Order same-millisecond fills by execution, not trade id (#1)
- [ ] Stable trade keys that survive history sliding and never collide
- [ ] Back off and retry on Hyperliquid `429`s instead of failing the sync
- [ ] Reconciliation check: compare perpbook's total PnL with Hyperliquid's own `portfolio` PnL and show a "matches Hyperliquid" badge, or explain the difference
- [ ] Show funding that can't be attributed to a trade (paid before the first stored fill) instead of letting totals differ silently
- [ ] Tests built from real fill patterns: liquidations, ADL, HIP-3 markets, TWAP slices, partial closes

## 2. Never lose history (design: [permanent-history.md](permanent-history.md))

- [ ] Database layer, migrations and tests (Postgres; PGlite in tests)
- [ ] `syncWallet`: incremental fills and funding, gap detection, adaptive scheduling
- [ ] Sync worker with a per-IP weight budget
- [ ] `POST /api/w/[address]/track` and `GET /api/w/[address]/history`
- [ ] Dashboard loads stored history plus the live delta; "Keep my history" button; missing-dates notice
- [ ] `docker-compose.yml` (app, worker, postgres) and a self-hosting section in the README
- [ ] 👤 Create the hosted database (proposal: Neon) and worker host (proposal: Fly.io); set `DATABASE_URL` on Vercel

## 3. Things that bring people in

- [ ] Shareable PnL card: an Open Graph image for every `/w/[address]` link, so posting a wallet on X shows its stats
- [ ] Download a PnL card as an image from the dashboard
- [ ] Monthly "wrapped" summary page per wallet
- [ ] Landing page that sells it: real screenshot, the three promises (trades not fills, real PnL, read-only), a demo link above the fold
- [ ] SEO basics: titles, descriptions, sitemap, `robots.txt`
- [ ] Privacy-friendly page-view analytics (e.g. Plausible or Vercel Analytics) so launches can be measured
- [ ] 👤 Custom domain (e.g. perpbook.xyz)

## 4. The journal (needs accounts)

- [ ] Email magic-link sign-in; follow several wallets with labels
- [ ] Notes, setup tags and mistake tags on every trade
- [ ] R multiples from a planned stop
- [ ] Breakdowns by tag ("your 'breakout' trades make money, your 'revenge' trades don't")
- [ ] CSV import with a TradeZella preset

## 5. Pro

- [ ] Plan limits (free: one tracked wallet, last 90 days visible; Pro: unlimited wallets and full history)
- [ ] AI weekly review: a short written review of the week's trades and the patterns behind wins and losses
- [ ] Billing and upgrade flow
- [ ] 👤 Stripe account, prices, tax settings
- [ ] 👤 Privacy policy and terms (needed once accounts and payments exist)

## 6. Reaching users

Before launch:
- [ ] Launch thread for X, written around a real finding ("we rebuilt 7,800 fills from one wallet: here's what the exchange UI doesn't tell you")
- [ ] Short demo video or GIF of paste address → dashboard
- [ ] Outreach notes for Hyperliquid front-ends (Invo and others) offering perpbook as their journal link
- [ ] README polish: badges, screenshot, "self-host in one command"
- [ ] 👤 X account for perpbook; Discord or GitHub Discussions for feedback

Launch:
- [ ] 👤 Post the thread; share in Hyperliquid community channels
- [ ] 👤 Show HN ("open-source trading journal for Hyperliquid") once self-hosting works
- [ ] 👤 Ask 10 active traders to try it and watch them use it

After launch:
- [ ] Weekly changelog post
- [ ] Track: wallets viewed, wallets tracked, returning users after 7 days
- [ ] Second venue adapter once Hyperliquid is solid (most requested wins)
