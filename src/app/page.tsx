import Link from "next/link";
import { AddressForm } from "@/components/AddressForm";

const points = [
  ["Paste an address, done", "No API keys, no CSVs, no manual entry. Trades sync straight from Hyperliquid's public data, Invo and builder perps included."],
  ["Trades, not fills", "Scale in three times and out twice and it's still one trade. Flips, fees and funding are split to the right one."],
  ["See what actually works", "Win rate, profit factor and PnL by coin, side, hour and weekday, so you can stop trading the setups that lose."],
  ["Open source", "AGPL-licensed. Self-host it for free, read every line that touches your data, or use the hosted version."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6">
      <header className="flex items-center h-16">
        <span className="font-semibold tracking-tight text-lg">
          perpbook<span className="text-accent">.</span>
        </span>
        <a href="https://github.com/patrickballard/perpbook" className="ml-auto text-sm text-ink-2 hover:text-ink">
          GitHub
        </a>
      </header>

      <section className="pt-14 sm:pt-24 pb-14 max-w-2xl">
        <p className="eyebrow mb-4">Open-source trading journal for perps</p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
          Your perp trades, journaled the moment you take them.
        </h1>
        <p className="mt-5 text-lg text-ink-2 max-w-xl">
          Paste a Hyperliquid wallet and get every trade rebuilt, your real PnL after fees and funding, and where your edge actually is.
        </p>
        <div className="mt-8 max-w-xl">
          <AddressForm />
          <p className="text-sm text-muted mt-3">
            Read-only and public data only. Or{" "}
            <Link href="/w/demo" className="text-accent underline underline-offset-2">
              look around a demo account
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 gap-3 pb-20">
        {points.map(([title, body]) => (
          <div key={title} className="card p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
