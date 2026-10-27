"use client";

import Link from "next/link";
import { useWallet } from "@/lib/useWallet";
import { compactUsd } from "@/lib/share";
import type { OpenPosition } from "@/lib/hyperliquid/types";
import { duration, money, moneyHeadline, pct, price, ratio, shortAddress, size } from "@/lib/format";
import { EquityChart } from "./EquityChart";
import { PnlCalendar } from "./PnlCalendar";
import { HBars, VBars } from "./Bars";
import { TradesTable } from "./TradesTable";
import { HistoryNotice, savedSince } from "./HistoryNotice";
import { Reconcile } from "./Reconcile";
import { ShareCardButton } from "./ShareCardButton";
import { cardData } from "@/lib/card";

// Narrow cards wrap their sub lines; keep each amount on one line so "−" never strands from its "$65,291.45".
const unbroken = (text: string) =>
  text.split(/([+−]?\$[\d,.]+[kMB]?)/).map((part, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{part}</span> : part));

function Kpi({ label, value, title, sub, tone }: { label: string; value: string; title?: string; sub?: string; tone?: "up" | "down" | "flat" }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="eyebrow">{label}</div>
      <div className={`num text-xl sm:text-2xl font-semibold mt-1.5 whitespace-nowrap ${tone ?? ""}`} title={title}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-1 num">{unbroken(sub)}</div>}
    </div>
  );
}

function Section({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 min-w-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-semibold">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const toneOf = (v: number | null | undefined) => (v == null ? "flat" : v > 0.004 ? "up" : v < -0.004 ? "down" : "flat");

function OpenPositions({ positions }: { positions: OpenPosition[] }) {
  return (
    <div className="space-y-1.5">
      {positions.map((p) => (
        <div key={p.coin} className="flex items-center gap-3 text-sm">
          <span className="font-medium w-20 sm:w-24 shrink-0 truncate" title={p.coin}>
            {p.coin}
          </span>
          <span className={`shrink-0 ${p.size > 0 ? "up" : "down"}`}>{p.size > 0 ? "Long" : "Short"}</span>
          <span className="num text-ink-2 min-w-0 truncate whitespace-nowrap">
            <span className="hidden sm:inline">{size(p.size)} </span>@ {price(p.entryPx)}
            {p.leverage ? <span className="hidden sm:inline"> · {p.leverage}x</span> : null}
          </span>
          <span className={`num ml-auto shrink-0 whitespace-nowrap font-medium ${toneOf(p.unrealizedPnl)}`}>{money(p.unrealizedPnl)}</span>
        </div>
      ))}
    </div>
  );
}

export function Dashboard({ address }: { address: string }) {
  const { status, error, raw, derived, sync, demo, track, tracking, trackError, progress } = useWallet(address);
  // Nothing to journal: no perp fills and nothing open. Usually the wrong address was pasted.
  const empty = !!raw?.complete && raw.fills.length === 0 && raw.positions.length === 0;
  const full = !!raw?.complete && !empty;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      <header className="flex flex-wrap items-center gap-3 mb-6">
        <Link href="/" className="font-semibold tracking-tight text-lg mr-auto">
          perpbook<span className="text-accent">.</span>
        </Link>
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <span
            className={`h-2 w-2 rounded-full ${status === "loading" ? "bg-[var(--accent)] animate-pulse" : status === "error" ? "bg-[var(--down)]" : "bg-[var(--up)]"}`}
          />
          <span className="num">{demo ? "Demo account" : shortAddress(address)}</span>
          {raw && <span className="text-muted hidden sm:inline">· synced {new Date(raw.syncedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
          {raw && savedSince(raw.storage) && <span className="text-muted hidden md:inline">· history saved since {savedSince(raw.storage)}</span>}
        </div>
        <ShareCardButton
          filename={`perpbook-${demo ? "demo" : `${address.slice(0, 6)}-${address.slice(-4)}`}.png`}
          data={
            derived && full && !raw?.fundingPending && typeof window !== "undefined"
              ? cardData({ label: demo ? "Demo account" : shortAddress(address), stats: derived.stats, trades: derived.trades, reconciliation: derived.reconciliation, host: window.location.host })
              : null
          }
        />
        <button onClick={() => void sync()} disabled={status === "loading"} className="h-9 px-3 rounded-lg border border-line text-sm hover:bg-raised disabled:opacity-50">
          {status === "loading" ? "Syncing…" : "Refresh"}
        </button>
      </header>

      {demo && (
        <div className="card px-4 py-3 mb-4 text-sm text-ink-2">
          This is a generated sample account. <Link href="/" className="text-accent underline underline-offset-2">Paste your own wallet</Link> to see your trades.
        </div>
      )}

      {status === "error" && (
        <div className="card px-4 py-3 mb-4 text-sm">
          <span className="down font-medium">Couldn&apos;t sync.</span> <span className="text-ink-2">{error}</span>
        </div>
      )}

      {full && raw && <HistoryNotice storage={raw.storage} onTrack={() => void track()} tracking={tracking} trackError={trackError} />}

      {status === "loading" && progress && (
        <p className="text-sm text-ink-2 mb-4 px-1" aria-live="polite">
          <span className="num">{progress}</span> <span className="text-muted">Active wallets can take a minute or two.</span>
        </p>
      )}

      {!derived && status === "loading" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      )}

      {raw && !raw.complete && (
        <div className="space-y-4">
          <div className="card px-4 py-3 text-sm text-ink-2">
            <span className="font-medium text-ink">This wallet is too active to rebuild trade by trade here.</span> It has more fills than perpbook
            loads in one go{raw.fills[0] ? ` (over ${raw.fills.length.toLocaleString("en-GB")} since ${new Date(raw.fills[0].time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})` : ""}, and
            numbers rebuilt from part of its history would be wrong. These are Hyperliquid&apos;s own totals instead.
          </div>
          {raw.summary ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Kpi label="All-time PnL" value={moneyHeadline(raw.summary.allTime)} tone={toneOf(raw.summary.allTime)} sub="perps, after fees and funding · from Hyperliquid" />
              <Kpi label="Last 30 days" value={raw.summary.month == null ? "–" : moneyHeadline(raw.summary.month)} tone={toneOf(raw.summary.month)} sub="from Hyperliquid" />
              <Kpi label="Volume" value={compactUsd(raw.summary.volume)} sub="all-time perps · from Hyperliquid" />
            </div>
          ) : (
            <p className="text-sm text-muted px-1">Hyperliquid&apos;s totals aren&apos;t available for this wallet right now.</p>
          )}
          {raw.positions.length > 0 && (
            <Section title="Open now" hint="Live from Hyperliquid">
              <OpenPositions positions={raw.positions} />
            </Section>
          )}
        </div>
      )}

      {empty && raw && (
        <div className="card p-6 sm:p-8 space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {raw.rawFillCount > 0 ? "Only spot trades on this address" : "No Hyperliquid trades found for this address"}
          </h2>
          {raw.rawFillCount > 0 ? (
            <p className="text-sm text-ink-2 max-w-2xl">
              This wallet has traded spot on Hyperliquid, but perpbook journals perpetuals only, and there are no perp trades here yet.
            </p>
          ) : (
            <ul className="text-sm text-ink-2 max-w-2xl list-disc pl-5 space-y-1.5">
              <li>Check it&apos;s the address you trade with on Hyperliquid. Your main account, not an API or agent wallet.</li>
              <li>Trading through a front-end like Invo? Copy the wallet address it shows you; that&apos;s the one trading on Hyperliquid.</li>
              <li>If you only just started, trades appear here as soon as your first one fills.</li>
            </ul>
          )}
          <p className="text-sm">
            <Link href="/" className="text-accent underline underline-offset-2">
              Try another address
            </Link>{" "}
            <span className="text-muted">or</span>{" "}
            <Link href="/w/demo" className="text-accent underline underline-offset-2">
              look around the demo
            </Link>
            .
          </p>
        </div>
      )}

      {derived && full && raw && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Net PnL"
              value={moneyHeadline(derived.stats.net)}
              title={money(derived.stats.net)}
              tone={toneOf(derived.stats.net)}
              sub={
                raw.fundingPending
                  ? `after ${money(derived.stats.fees, { sign: false })} fees · funding still loading…`
                  : `after ${money(derived.stats.fees, { sign: false })} fees · ${money(derived.stats.funding)} funding`
              }
            />
            <Kpi label="Win rate" value={pct(derived.stats.winRate)} sub={`${derived.stats.wins} won · ${derived.stats.losses} lost`} />
            <Kpi
              label="Profit factor"
              value={ratio(derived.stats.profitFactor)}
              tone={derived.stats.profitFactor == null ? "flat" : derived.stats.profitFactor >= 1 ? "up" : "down"}
              sub={`avg win ${money(derived.stats.avgWin)} · avg loss ${money(derived.stats.avgLoss)}`}
            />
            <Kpi
              label="Per trade"
              value={derived.stats.expectancy == null ? "–" : moneyHeadline(derived.stats.expectancy)}
              title={money(derived.stats.expectancy)}
              tone={toneOf(derived.stats.expectancy)}
              sub={`${derived.stats.trades} trades · avg hold ${duration(derived.stats.avgHoldMs)}`}
            />
          </div>

          {derived.reconciliation && !raw.fundingPending && <Reconcile r={derived.reconciliation} firstFillTime={raw.fills[0]?.time ?? null} hyperliquidSince={raw.hyperliquidSince} />}

          <div className="grid lg:grid-cols-5 gap-4 items-start">
            <Section title="Equity" hint="Cumulative net PnL by day" className="lg:col-span-3">
              <EquityChart points={derived.equity} />
            </Section>
            <Section title="Calendar" hint={derived.streak > 1 ? `${derived.streak} green days in a row` : undefined} className="lg:col-span-2">
              <PnlCalendar days={derived.days} />
            </Section>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="By coin" hint="Net PnL, best first">
              <HBars buckets={derived.stats.byCoin} />
            </Section>
            <Section title="Long vs short">
              <HBars buckets={derived.stats.byDirection.map((b) => ({ ...b, label: b.label === "long" ? "Long" : "Short" }))} />
              {raw.positions.length > 0 && (
                <div className="mt-5">
                  <div className="eyebrow mb-2">Open now</div>
                  <OpenPositions positions={raw.positions} />
                </div>
              )}
            </Section>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Section title="By hour opened" hint="Your local time" className="md:col-span-2">
              <VBars buckets={derived.stats.byHour} labelEvery={3} />
            </Section>
            <Section title="By weekday">
              <VBars buckets={derived.stats.byWeekday} />
            </Section>
          </div>

          <Section title="Trades" hint="Fills rebuilt into round trips, open to flat">
            <TradesTable trades={derived.trades} />
          </Section>
        </div>
      )}

      <footer className="mt-10 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
        <span>Read-only: perpbook only ever reads public data for this address.</span>
        <a href="https://github.com/patrickballard/perpbook" className="underline underline-offset-2 hover:text-ink-2">
          Open source on GitHub
        </a>
      </footer>
    </main>
  );
}
