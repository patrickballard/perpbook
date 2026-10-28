// The questions people actually ask about Hyperliquid PnL, answered plainly. Shown on the home page,
// sent to search engines as FAQPage data, and listed in /llms.txt, so all three say the same thing.
export const FAQ: [question: string, answer: string][] = [
  [
    "What is perpbook?",
    "A free, open-source trading journal for Hyperliquid perps. Paste a wallet address and it rebuilds every trade from your fills, with your real PnL after fees and funding, win rate, profit factor, a PnL calendar and an equity curve.",
  ],
  [
    "How do I see my real PnL on Hyperliquid after fees and funding?",
    "Paste your Hyperliquid address into perpbook. It adds trading fees and hourly funding to each trade, includes open positions, and checks the total against Hyperliquid's own all-time PnL so you can see the numbers add up.",
  ],
  [
    "Is perpbook free? Do I need to connect my wallet?",
    "It's free and read-only. You paste an address: no wallet connection, keys, signatures or CSV exports. perpbook only reads public data from Hyperliquid.",
  ],
  [
    "Why can't I see all of my old Hyperliquid trades?",
    "Hyperliquid's API only guarantees your latest 10,000 fills. Click Save history on your perpbook page and it keeps its own copy of every fill from then on.",
  ],
  [
    "Does it work with front-ends built on Hyperliquid and HIP-3 markets?",
    "Yes. perpbook reads the wallet, not the app you traded from, so trades placed through front-ends built on Hyperliquid, such as Invo, show up, and so do positions on builder-deployed (HIP-3) markets.",
  ],
  [
    "What is the perpbook league?",
    "A weekly competition for Hyperliquid perps traders, ranked by % return after fees and funding, so a small account can beat a whale. Standings update live on perpbook's league page.",
  ],
  [
    "Can I host perpbook myself?",
    "Yes. It's AGPL-licensed and on GitHub at github.com/patrickballard/perpbook, and it runs on free tiers: Vercel, Neon Postgres and a GitHub Actions sync job.",
  ],
];
