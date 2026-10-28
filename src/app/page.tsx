import Image from "next/image";
import Link from "next/link";
import { AddressForm } from "@/components/AddressForm";
import { FAQ } from "@/lib/faq";
import { siteUrl } from "@/lib/site";

const REPO = "https://github.com/patrickballard/perpbook";

// Measured on a live, active Hyperliquid wallet in October 2026 (pull request #1).
const proof = [
  ["7,800 fills", "773 trades", "One active wallet's fills, rebuilt into the trades they actually were. Grouped naively, the same fills look like 3,244 trades."],
  ["Your PnL", "checked against Hyperliquid", "Realised plus open PnL is compared with Hyperliquid's own figure, so you can see the numbers add up."],
  ["Saved wallets", "load in seconds", "Hyperliquid's API only guarantees your latest 10,000 fills. Save your wallet and perpbook keeps its own copy of every fill from then on."],
];

const points = [
  ["Trades, not fills", "Scale in three times and out twice and it's still one trade. Flips are split in two, and fees and funding go to the right trade."],
  ["Real PnL", "After fees and hourly funding, by day, coin, side, hour and weekday, including open positions on builder-deployed (HIP-3) markets."],
  ["See what works", "Win rate, profit factor and expectancy, a PnL calendar and an equity curve, so you can stop trading the setups that lose."],
  ["Read-only and open source", "Paste an address: no keys, no signatures, no CSVs. AGPL-licensed, so you can read every line or host it yourself."],
];

// What the page is, for search engines and the AI assistants that read their results.
function structuredData() {
  const url = siteUrl()?.toString();
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "perpbook",
      ...(url ? { url } : {}),
      description: "Free, open-source trading journal for Hyperliquid perps: every trade rebuilt from a wallet's fills, with real PnL after fees and funding.",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Any (web browser)",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      sameAs: [REPO],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
  // Escaped so no answer can close the script tag.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData() }} />
      <header className="flex items-center gap-5 h-16">
        <span className="font-semibold tracking-tight text-lg mr-auto">
          perpbook<span className="text-accent">.</span>
        </span>
        <Link href="/league" className="text-sm text-ink-2 hover:text-ink">
          League
        </Link>
        <Link href="/w/demo" className="text-sm text-ink-2 hover:text-ink">
          Demo
        </Link>
        <a href={REPO} className="text-sm text-ink-2 hover:text-ink">
          GitHub
        </a>
      </header>

      <section className="pt-12 sm:pt-20 pb-12 max-w-2xl">
        <p className="eyebrow mb-4">Open-source trading journal for Hyperliquid</p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">Every perp trade, rebuilt from your wallet.</h1>
        <p className="mt-5 text-lg text-ink-2 max-w-xl">
          Paste a Hyperliquid address and see your real PnL after fees and funding, trade by trade, and where your edge actually is.
        </p>
        <div className="mt-8 max-w-xl">
          <AddressForm />
          <p className="text-sm text-muted mt-3">
            Read-only, public data only. Or{" "}
            <Link href="/w/demo" className="text-accent underline underline-offset-2">
              look around a demo account
            </Link>
            .
          </p>
        </div>
      </section>

      <Link href="/w/demo" aria-label="Open the demo account" className="block rounded-2xl border border-line overflow-hidden shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)] hover:border-[var(--axis)] transition-colors">
        <Image src="/dashboard-light.png" alt="The perpbook dashboard for the demo account: net PnL, win rate, equity curve and PnL calendar" width={2560} height={1480} sizes="(min-width: 1152px) 1104px, 100vw" className="w-full h-auto dark:hidden" priority />
        <Image src="/dashboard-dark.png" alt="The perpbook dashboard for the demo account: net PnL, win rate, equity curve and PnL calendar" width={2560} height={1480} sizes="(min-width: 1152px) 1104px, 100vw" className="w-full h-auto hidden dark:block" priority />
      </Link>

      <section className="grid md:grid-cols-3 gap-3 pt-14">
        {proof.map(([big, small, body]) => (
          <div key={big} className="card p-5">
            <p className="text-2xl font-semibold tracking-tight">
              {big} <span className="text-accent">→</span> {small}
            </p>
            <p className="text-sm text-ink-2 mt-2 leading-relaxed">{body}</p>
          </div>
        ))}
      </section>

      <section className="grid sm:grid-cols-2 gap-3 pt-3 pb-16">
        {points.map(([title, body]) => (
          <div key={title} className="card p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{body}</p>
          </div>
        ))}
      </section>

      <section className="card p-6 sm:p-8 mb-16 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="mr-auto">
          <h2 className="text-xl font-semibold tracking-tight">See your own trades</h2>
          <p className="text-sm text-ink-2 mt-1">Works for Hyperliquid perps, front-ends built on it such as Invo, and HIP-3 markets.</p>
        </div>
        <div className="sm:w-[28rem]">
          <AddressForm />
        </div>
      </section>

      <section className="pb-16 max-w-3xl">
        <h2 className="text-xl font-semibold tracking-tight mb-4">Questions</h2>
        <div className="space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card px-5 py-4 group">
              <summary className="font-medium cursor-pointer list-none flex items-center gap-3">
                <span className="mr-auto">{q}</span>
                <span className="text-muted transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-sm text-ink-2 mt-2 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-line py-8 text-xs text-muted flex flex-wrap gap-x-5 gap-y-2">
        <span>perpbook is an analytics tool, not financial advice.</span>
        <a href={REPO} className="underline underline-offset-2 hover:text-ink-2">
          Open source on GitHub
        </a>
        <span>AGPL-3.0</span>
      </footer>
    </main>
  );
}
