"use client";

import Link from "next/link";
import { useWallet } from "@/lib/useWallet";
import { duration, money, pct, price, ratio, shortAddress, size } from "@/lib/format";
import { EquityChart } from "./EquityChart";
import { PnlCalendar } from "./PnlCalendar";
import { HBars, VBars } from "./Bars";
import { TradesTable } from "./TradesTable";
import { HistoryNotice, savedSince } from "./HistoryNotice";
import { Reconcile } from "./Reconcile";

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "flat" }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className={`num text-2xl font-semibold mt-1.5 ${tone ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1 num">{sub}</div>}
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

export function Dashboard({ address }: { address: string }) {
  const { status, error, raw, derived, sync, demo, track, tracking, trackError } = useWallet(address);

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
          <span className="down font-medium">Couldn&apos;t sync.</span> <span className="text-ink-2">{error}. Check the address is your main account, not an API or agent wallet.</span>
        </div>
      )}

      {raw && <HistoryNotice storage={raw.storage} rawFillCount={raw.rawFillCount} onTrack={() => void track()} tracking={tracking} trackError={trackError} />}

      {!derived && status === "loading" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      )}

      {derived && raw && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Net PnL"
              value={money(derived.stats.net)}
              tone={toneOf(derived.stats.net)}
              sub={`after ${money(derived.stats.fees, { sign: false })} fees · ${money(derived.stats.funding)} funding`}
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
              value={money(derived.stats.expectancy)}
              tone={toneOf(derived.stats.expectancy)}
              sub={`${derived.stats.trades} trades · avg hold ${duration(derived.stats.avgHoldMs)}`}
            />
          </div>

          {derived.reconciliation && <Reconcile r={derived.reconciliation} firstFillTime={raw.fills[0]?.time ?? null} />}

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
                  <div className="space-y-1.5">
                    {raw.positions.map((p) => (
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
        <a href="https://github.com/paddy1878/perpbook" className="underline underline-offset-2 hover:text-ink-2">
          Open source on GitHub
        </a>
      </footer>
    </main>
  );
}
