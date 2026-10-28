import type { Metadata } from "next";
import Link from "next/link";
import { HyperliquidClient } from "@/lib/hyperliquid/client";
import { budgetedFetch, WeightBudget } from "@/lib/sync/budget";
import { currentSeason, X_PROFILE } from "@/lib/league/seasons";
import { MIN_ACCOUNT, rank, standings, type Standing } from "@/lib/league/standings";
import { money, shortAddress, tone } from "@/lib/format";

// The same for everyone: work the standings out at most every 10 minutes and serve that copy, so a
// busy page costs Hyperliquid one request per entrant per 10 minutes, not per visitor.
export const revalidate = 600;
// A big league's fills can take a while; standings() stops fetching them well before this.
export const maxDuration = 60;

const season = currentSeason();

export const metadata: Metadata = {
  title: `perpbook league · ${season.name}`,
  description: "A week of Hyperliquid perps, ranked by % return after fees and funding. A $500 account can beat a whale.",
};

const uk = (ms: number, o: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString("en-GB", { timeZone: "Europe/London", ...o });
const moment = (ms: number) => uk(ms, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const pct = (r: number) => `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r * 100).toFixed(1)}%`;
const MEDALS = ["🥇", "🥈", "🥉"];

function Row({ s, place }: { s: Standing; place: number }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 pl-3 pr-1 w-10 text-ink-2 num">{MEDALS[place - 1] ?? place}</td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <a href={`https://x.com/${s.handle.replace(/^@/, "")}`} className="font-medium truncate hover:underline underline-offset-2">
            {s.handle}
          </a>
          {s.liquidated && (
            <span className="shrink-0" title="Liquidated this week">
              💀
            </span>
          )}
        </div>
        <div>
          <Link href={`/w/${s.address}`} className="num text-xs text-muted hover:text-ink-2">
            {shortAddress(s.address)}
          </Link>
        </div>
      </td>
      <td className={`py-2.5 px-2 text-right num font-semibold ${tone(s.ret)}`}>
        {pct(s.ret!)}
        {/* Phones have no PnL column, and "made the most, finished fourth" is half the fun. */}
        <div className={`sm:hidden text-xs font-normal ${tone(s.pnl)}`}>{money(s.pnl, { compact: true, whole: true })}</div>
      </td>
      <td className={`py-2.5 px-2 text-right num hidden sm:table-cell ${tone(s.pnl)}`}>{money(s.pnl, { compact: true, whole: true })}</td>
      <td className="py-2.5 pl-2 pr-3 text-right num text-ink-2 hidden sm:table-cell">{s.closed ?? "–"}</td>
    </tr>
  );
}

/** The season as of this render, which ISR repeats at most every `revalidate` seconds. */
async function snapshot() {
  const now = Date.now();
  const started = now >= season.start;
  const rows = started && season.entrants.length ? await standings(season, new HyperliquidClient(budgetedFetch(new WeightBudget(1_000))), now) : [];
  return { now, started, ended: now >= season.end, ...rank(rows) };
}

export default async function LeaguePage() {
  const { now, started, ended, ranked, sittingOut } = await snapshot();
  const enter = season.entryUrl ?? X_PROFILE;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
      <header className="flex items-center gap-5 mb-10">
        <Link href="/" className="font-semibold tracking-tight text-lg mr-auto">
          perpbook<span className="text-accent">.</span>
        </Link>
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">
          Open a journal
        </Link>
      </header>

      <section className="mb-6">
        <p className="eyebrow mb-3">perpbook league · {season.name}</p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">Who traded best this week?</h1>
        <p className="mt-3 text-ink-2 max-w-xl">
          Hyperliquid perps, ranked by % return after fees and funding, open positions included. A $500 account can beat a whale.
        </p>
        <p className="mt-4 text-sm num text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {ended ? (
            <span className="font-medium text-ink">Final</span>
          ) : started ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <span className="h-2 w-2 rounded-full bg-[var(--up)] animate-pulse" /> Live
            </span>
          ) : (
            <span className="font-medium text-ink">Starts {moment(season.start)} UK</span>
          )}
          <span className="text-muted">·</span>
          <span>{ended ? `${uk(season.start, { day: "numeric", month: "short" })} – ${uk(season.end, { day: "numeric", month: "short" })}` : `ends ${moment(season.end)} UK`}</span>
          {started && !ended && (
            <>
              <span className="text-muted">·</span>
              <span className="text-muted">updated {uk(now, { hour: "2-digit", minute: "2-digit" })}, every 10 min</span>
            </>
          )}
        </p>
        {!ended && (
          <a href={enter} className="inline-flex items-center mt-5 h-11 px-5 rounded-xl bg-ink text-page font-medium hover:opacity-90">
            Enter: reply with your wallet
          </a>
        )}
      </section>

      {!started && (
        <section className="card p-5">
          {season.entrants.length ? (
            <>
              <h2 className="font-semibold">{season.entrants.length.toLocaleString("en-GB")} in so far</h2>
              <p className="text-sm text-ink-2 mt-2 leading-relaxed">{season.entrants.map((e) => e.handle).join(" · ")}</p>
            </>
          ) : (
            <>
              <h2 className="font-semibold">Entries are open</h2>
              <p className="text-sm text-ink-2 mt-1">Reply to the post with your Hyperliquid wallet. Entries count from Monday, even if they come in later.</p>
            </>
          )}
        </section>
      )}

      {started && (
        <section className="card overflow-hidden">
          {ranked.length ? (
            // Fixed columns, so a long handle is cut short instead of pushing the return off the card.
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-left border-b border-line">
                  <th className="eyebrow font-medium py-2.5 pl-3 pr-1 w-10">#</th>
                  <th className="eyebrow font-medium py-2.5 px-2">Trader</th>
                  <th className="eyebrow font-medium py-2.5 px-2 text-right w-24">Return</th>
                  <th className="eyebrow font-medium py-2.5 px-2 text-right hidden sm:table-cell w-24">PnL</th>
                  <th className="eyebrow font-medium py-2.5 pl-2 pr-3 text-right hidden sm:table-cell w-20">Trades</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, i) => (
                  <Row key={s.address} s={s} place={i + 1} />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-5 text-sm text-ink-2">{season.entrants.length ? "Nobody has traded yet this week." : "No entries yet. Reply to the post with your wallet to be first."}</p>
          )}
        </section>
      )}

      {sittingOut.length > 0 && (
        <p className="text-xs text-muted mt-3 px-1">
          Not ranked yet: {sittingOut.map((s) => s.handle).join(", ")} (no perps this week, or under ${MIN_ACCOUNT} in the account).
        </p>
      )}

      <section className="mt-8 text-xs text-muted space-y-1.5 px-1 max-w-xl">
        <p>
          <span className="text-ink-2 font-medium">How it&apos;s scored.</span> Perps PnL from Hyperliquid&apos;s own numbers, Monday 00:00 to Sunday 20:00 UK, divided by
          the account&apos;s value at the start (or its average over the week, if that&apos;s bigger, so a mid-week deposit doesn&apos;t count as profit). Holding a position counts.
          💀 means liquidated this week.
        </p>
        <p>Read-only: perpbook only reads public data. Not financial advice.</p>
      </section>
    </main>
  );
}
