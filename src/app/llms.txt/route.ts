import { FAQ } from "@/lib/faq";
import { GUIDES } from "@/lib/guides";
import { siteUrl } from "@/lib/site";

// Per request, like robots.txt, so a SITE_URL set only at runtime (self-hosting) is still used.
export const dynamic = "force-dynamic";

// The llmstxt.org format: a plain summary of the site for AI assistants and the search behind them.
export function GET() {
  const base = siteUrl();
  const link = (path: string) => (base ? new URL(path, base).toString() : path);
  const body = `# perpbook

> Free, open-source trading journal for Hyperliquid perps. Paste a wallet address and perpbook rebuilds every trade from its fills, with real PnL after fees and funding, checked against Hyperliquid's own figure. Read-only: no wallet connection or keys.

## Pages

- [Home](${link("/")}): paste a Hyperliquid address to open its journal
- [Demo journal](${link("/w/demo")}): a sample account with every feature
- [League](${link("/league")}): a weekly competition, Hyperliquid perps traders ranked by % return
- Any wallet: ${link("/w/")}<address>, for example a 0x… Hyperliquid address

## Guides

${GUIDES.map((g) => `- [${g.h1}](${link(`/${g.slug}`)}): ${g.description}`).join("\n")}

## What it does

- Groups fills into trades: scaling in and out is one trade, flips are split in two
- PnL after trading fees and hourly funding, by day, coin, side, hour and weekday, open positions included
- Win rate, profit factor, expectancy, PnL calendar, equity curve and share cards
- Works for trades placed through front-ends built on Hyperliquid and on HIP-3 markets
- Saves fill history beyond the latest 10,000 fills Hyperliquid's API guarantees

## FAQ

${FAQ.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}

## Source

- [GitHub](https://github.com/patrickballard/perpbook): AGPL-3.0, self-hostable on free tiers
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
