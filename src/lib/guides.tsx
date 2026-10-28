import type { ReactNode } from "react";

// One page per question people ask about Hyperliquid PnL, each titled with the words they search
// for. Search engines, and the AI assistants that answer from them, match a page to a question
// mostly by its title and headings, so a home page alone never comes up for any of them.
export type Guide = {
  slug: string;
  /** The <title>: the search, nearly word for word. */
  title: string;
  description: string;
  eyebrow: string;
  /** Short link text, for footers and lists. */
  label: string;
  h1: string;
  intro: string;
  sections: { h: string; body: ReactNode }[];
  faq: [question: string, answer: string][];
};

const REPO = "https://github.com/patrickballard/perpbook";

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} className="text-accent underline underline-offset-2">
    {children}
  </a>
);

export const GUIDES: Guide[] = [
  {
    slug: "hyperliquid-trading-journal",
    label: "Hyperliquid trading journal",
    title: "Free Hyperliquid Trading Journal · perpbook",
    description:
      "A free, open-source trading journal for Hyperliquid perps. Paste your wallet address: every trade rebuilt from your fills, with PnL after fees and funding, win rate and profit factor. No sign-up.",
    eyebrow: "Hyperliquid trading journal",
    h1: "A free trading journal for Hyperliquid",
    intro:
      "perpbook turns a Hyperliquid wallet into a trading journal. Paste an address and it rebuilds every perp trade from the wallet's fills, works out the real PnL of each one after fees and funding, and shows where your edge actually is. There's no sign-up, no wallet connection and no CSV to export.",
    sections: [
      {
        h: "How to journal your Hyperliquid trades",
        body: (
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Copy your wallet address from Hyperliquid (or the front-end you trade on): 0x followed by 40 characters.</li>
            <li>Paste it into the box below. perpbook reads your fills and funding from Hyperliquid&apos;s public API.</li>
            <li>Your journal opens: every trade, its entry and exit, size, fees, funding and net PnL, plus the stats across all of them.</li>
            <li>Click <strong>Save history</strong> so perpbook keeps its own copy of your fills from then on.</li>
          </ol>
        ),
      },
      {
        h: "What's in it",
        body: (
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Trades, not fills.</strong> Scale in three times and out twice and it&apos;s still one trade. Flips are split into a closed trade and a new one.</li>
            <li><strong>Real PnL.</strong> Closed PnL minus trading fees, plus or minus hourly funding, for every trade and in total, open positions included.</li>
            <li><strong>Stats that matter.</strong> Win rate, profit factor, expectancy, average win and loss, a PnL calendar and an equity curve.</li>
            <li><strong>Where you make and lose money.</strong> PnL by coin, long or short, hour of day and day of week.</li>
            <li><strong>Share cards.</strong> One click turns your whole record into an image.</li>
          </ul>
        ),
      },
      {
        h: "Why perpbook",
        body: (
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Checked against Hyperliquid.</strong> Realised plus open PnL is compared with Hyperliquid&apos;s own all-time figure, and the journal says when they match.</li>
            <li><strong>Read-only.</strong> It only needs an address. It never asks for keys, signatures or an API key.</li>
            <li><strong>Open source.</strong> AGPL-licensed <A href={REPO}>on GitHub</A>, so you can read how every number is worked out, or host it yourself for free.</li>
            <li><strong>Every front-end.</strong> It reads the wallet, so trades placed through apps built on Hyperliquid count, and so do HIP-3 markets.</li>
          </ul>
        ),
      },
    ],
    faq: [
      ["Is perpbook free?", "Yes. The hosted version is free and the code is open source under AGPL-3.0."],
      ["Do I need an account?", "No. Paste a wallet address and the journal opens. Nothing to sign up for or connect."],
      ["Can I journal someone else's wallet?", "Yes. Hyperliquid is public, so any address works, which is also how you can study how other traders trade."],
    ],
  },
  {
    slug: "hyperliquid-pnl-tracker",
    label: "Hyperliquid PnL tracker",
    title: "Hyperliquid PnL Tracker: Free and Open Source · perpbook",
    description:
      "Track your Hyperliquid PnL after fees and funding, by coin, day, side and hour, including open positions and HIP-3 markets. Free, read-only and open source.",
    eyebrow: "Hyperliquid PnL tracker",
    h1: "Hyperliquid PnL tracker, free and open source",
    intro:
      "Paste a Hyperliquid wallet address and perpbook tracks its PnL across every trade: realised and unrealised, after trading fees and funding, and checked against Hyperliquid's own all-time figure so you know the total is right.",
    sections: [
      {
        h: "What it tracks",
        body: (
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Net PnL</strong> after fees and funding, all time and by day, on a calendar.</li>
            <li><strong>Open positions</strong> with unrealised PnL, including positions on builder-deployed (HIP-3) markets, which Hyperliquid&apos;s default API response leaves out.</li>
            <li><strong>Breakdowns</strong> by coin, long versus short, hour of day and weekday.</li>
            <li><strong>Fees and funding</strong> as their own totals, so you can see what they cost you.</li>
            <li><strong>An equity curve</strong> of cumulative net PnL.</li>
          </ul>
        ),
      },
      {
        h: "Open source",
        body: (
          <p>
            The whole tracker is <A href={REPO}>on GitHub</A> under AGPL-3.0: a Next.js and TypeScript app that reads Hyperliquid&apos;s public info API. Run it locally, host your own copy on free
            tiers (Vercel, Neon Postgres and a GitHub Actions sync job), or use the hosted version for free.
          </p>
        ),
      },
      {
        h: "How it checks itself",
        body: (
          <p>
            Hyperliquid publishes an all-time perps PnL for every account. perpbook adds up its own realised PnL and the unrealised PnL of open positions and compares the two. When they agree,
            the dashboard says <strong>✓ Matches Hyperliquid</strong>. When a wallet has more history than Hyperliquid&apos;s API will return, it says so and shows Hyperliquid&apos;s totals
            instead of a partial number.
          </p>
        ),
      },
    ],
    faq: [
      ["Does it track live positions?", "Yes. Open positions and their unrealised PnL load with the rest of the wallet, and refresh each time you open it."],
      ["Does it work for HIP-3 markets?", "Yes. perpbook asks every perp dex for positions, so builder-deployed markets are included."],
      ["Is it safe?", "It's read-only: it needs a public address, never a key or signature."],
    ],
  },
  {
    slug: "hyperliquid-pnl-after-fees-and-funding",
    label: "Real PnL after fees and funding",
    title: "How to See Your Real Hyperliquid PnL After Fees and Funding · perpbook",
    description:
      "How to work out your real Hyperliquid PnL: closed PnL minus fees plus funding, where each number comes from, the mistakes that make it wrong, and a free tool that does it for any wallet.",
    eyebrow: "Guide",
    h1: "How to see your real Hyperliquid PnL after fees and funding",
    intro:
      "The PnL Hyperliquid shows on a closed trade leaves out what it cost you to trade: fees, and the funding you paid or received while you held it. Here's how to work out the real number, and where each piece comes from.",
    sections: [
      {
        h: "The formula",
        body: (
          <>
            <p className="font-mono text-sm card px-4 py-3">net PnL = closed PnL − trading fees + funding</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-3">
              <li><strong>Closed PnL</strong> is on every fill that reduces a position, in your Trade History. It doesn&apos;t include the fee.</li>
              <li><strong>Trading fees</strong> are charged on every fill, opening and closing, and listed next to each fill.</li>
              <li><strong>Funding</strong> is paid or received every hour while a position is open, in your Funding History. Received funding is positive, paid is negative.</li>
            </ul>
            <p className="mt-3">For your whole account, add the unrealised PnL of open positions to get the total.</p>
          </>
        ),
      },
      {
        h: "A worked example",
        body: (
          <>
            <p>Say you open a long, add to it once, and close it in two parts over three days:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Closed PnL on the two closing fills: +$120 and +$80, so <strong>+$200</strong></li>
              <li>Fees on all four fills: <strong>−$18</strong></li>
              <li>72 hours of funding on a long while funding was positive: <strong>−$41</strong></li>
            </ul>
            <p className="mt-2">
              Real PnL: 200 − 18 − 41 = <strong>+$141</strong>, about 30% less than the closed PnL suggests. On a busy account, fees and funding are often the difference between a winning
              and a losing month.
            </p>
          </>
        ),
      },
      {
        h: "Mistakes that make the number wrong",
        body: (
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Counting fills as trades.</strong> One order that sweeps the book can fill a dozen times. Win rate and average trade are meaningless until fills are grouped into positions.</li>
            <li><strong>Forgetting funding.</strong> It&apos;s paid hourly and shows up in a separate history, so it&apos;s easy to miss on positions held for days.</li>
            <li><strong>Reading the portfolio chart as profit.</strong> Account value moves with deposits and withdrawals. Use PnL, not account value.</li>
            <li><strong>Missing HIP-3 positions.</strong> Builder-deployed markets sit on their own perp dexes, which tools that only ask the default dex never see.</li>
            <li><strong>Running out of history.</strong> Hyperliquid&apos;s API only guarantees your latest 10,000 fills, so an active account&apos;s early trades can drop out of view.</li>
          </ul>
        ),
      },
      {
        h: "Or let perpbook do it",
        body: (
          <p>
            Paste your address below. perpbook groups your fills into trades, applies fees and funding to the right trade, includes open positions, and checks the total against
            Hyperliquid&apos;s own all-time PnL. It&apos;s free, read-only and <A href={REPO}>open source</A>.
          </p>
        ),
      },
    ],
    faq: [
      ["Does Hyperliquid's closed PnL include fees?", "No. The closed PnL on a fill is before fees. The fee is listed separately on the same fill."],
      ["How often is funding paid on Hyperliquid?", "Every hour, for as long as the position is open. Longs pay shorts when funding is positive, and shorts pay longs when it's negative."],
      ["Where is Hyperliquid's own total PnL?", "On the Portfolio page, where PnL is shown over different periods. perpbook compares its own total with Hyperliquid's all-time perps figure."],
    ],
  },
  {
    slug: "hyperliquid-trade-history",
    label: "Hyperliquid trade history",
    title: "Analyse Your Hyperliquid Trade History for Free · perpbook",
    description:
      "See and analyse your full Hyperliquid trade history: every fill grouped into trades, with PnL after fees and funding. Why the API only guarantees 10,000 fills, and how to keep the rest.",
    eyebrow: "Hyperliquid trade history",
    h1: "Analyse your Hyperliquid trade history for free",
    intro:
      "Hyperliquid's Trade History tab lists fills, not trades, and its API only guarantees your most recent 10,000 of them. perpbook rebuilds your history into actual trades, analyses it, and can keep a copy so older trades don't drop out of view.",
    sections: [
      {
        h: "Fills versus trades",
        body: (
          <p>
            A fill is one match on the order book. A trade is a position from open to close. Scale in three times and out twice and you have five or more fills but one trade. On one
            active wallet, 7,800 fills were 773 trades; grouped naively by order they looked like 3,244, with a very different win rate. perpbook follows the position size Hyperliquid
            reports before every fill, so each trade starts and ends where the position actually did.
          </p>
        ),
      },
      {
        h: "The 10,000-fill limit",
        body: (
          <p>
            Hyperliquid&apos;s API documentation says only your 10,000 most recent fills are available. For an active trader that can be a few months. Click <strong>Save history</strong>{" "}
            on your perpbook page and it stores every fill from then on, so your journal keeps your full record even after Hyperliquid stops serving the older ones.
          </p>
        ),
      },
      {
        h: "What you get from your history",
        body: (
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Every trade with entry, exit, size, fees, funding and net PnL</li>
            <li>Win rate, profit factor and expectancy across all of them</li>
            <li>PnL by coin, side, hour and weekday: which setups and sessions make you money</li>
            <li>A PnL calendar and an equity curve</li>
          </ul>
        ),
      },
    ],
    faq: [
      ["How do I see my Hyperliquid trade history?", "In the Hyperliquid app, open Trade History for fills and Funding History for funding. For trades, PnL and stats, paste your address into perpbook."],
      ["Why are my old Hyperliquid trades missing?", "Hyperliquid's API only guarantees the latest 10,000 fills. Save your wallet on perpbook to keep its own copy from then on."],
      ["Is there a free tool to analyse Hyperliquid trades?", "Yes: perpbook is free, needs no account, and is open source."],
    ],
  },
];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);
