"use client";

import { useMemo, useState } from "react";
import type { Trade } from "@/lib/engine/trades";
import { count, duration, money, price, size, when } from "@/lib/format";

type Filter = "all" | "wins" | "losses" | "open";

export function TradesTable({ trades }: { trades: Trade[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [coin, setCoin] = useState("all");
  const [shown, setShown] = useState(25);

  const coins = useMemo(() => [...new Set(trades.map((t) => t.coin))].sort(), [trades]);
  const rows = useMemo(() => {
    return [...trades]
      .reverse()
      .filter((t) => coin === "all" || t.coin === coin)
      .filter((t) =>
        filter === "all"
          ? true
          : filter === "open"
            ? t.status === "open"
            : t.status === "closed" && (filter === "wins" ? t.netPnl > 0 : t.netPnl < 0),
      );
  }, [trades, filter, coin]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["all", "wins", "losses", "open"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setShown(25);
            }}
            className={`h-8 px-3 rounded-lg text-sm capitalize border ${
              filter === f ? "bg-ink text-page border-ink" : "border-line text-ink-2 hover:bg-raised"
            }`}
          >
            {f}
          </button>
        ))}
        <select
          value={coin}
          onChange={(e) => {
            setCoin(e.target.value);
            setShown(25);
          }}
          className="h-8 px-2 rounded-lg text-sm border border-line bg-surface text-ink-2"
          aria-label="Filter by coin"
        >
          <option value="all">All coins</option>
          {coins.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted ml-auto">{count(rows.length, "trade")}</span>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left">
              {["Opened", "Coin", "Side", "Hold", "Max size", "Entry", "Exit", "Fees + funding", "Net"].map((h, i) => (
                <th key={h} className={`eyebrow font-medium py-2 px-2 border-b border-line ${i >= 4 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((t) => (
              <tr key={t.key} className="border-b border-line last:border-0 hover:bg-raised">
                <td className="py-2 px-2 text-ink-2 whitespace-nowrap">{when(t.openedAt)}</td>
                <td className="py-2 px-2 font-medium">
                  {t.coin}
                  {t.partialHistory && (
                    <span className="ml-1.5 text-[10px] text-muted border border-line rounded px-1" title="Opened before the available history, so entry and PnL are incomplete">
                      partial
                    </span>
                  )}
                </td>
                <td className="py-2 px-2">
                  <span className={t.direction === "long" ? "up" : "down"}>{t.direction === "long" ? "Long" : "Short"}</span>
                </td>
                <td className="py-2 px-2 text-ink-2 num whitespace-nowrap">
                  {t.status === "open" ? <span className="text-accent">open</span> : duration(t.closedAt! - t.openedAt)}
                </td>
                <td className="py-2 px-2 text-right num text-ink-2">{size(t.maxSize)}</td>
                <td className="py-2 px-2 text-right num">{price(t.entryAvg)}</td>
                <td className="py-2 px-2 text-right num">{price(t.exitAvg)}</td>
                <td className="py-2 px-2 text-right num text-ink-2">{money(t.funding - t.fees)}</td>
                <td className={`py-2 px-2 text-right num font-medium ${t.status === "open" ? "flat" : t.netPnl > 0 ? "up" : "down"}`}>
                  {t.status === "open" ? "–" : money(t.netPnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <button onClick={() => setShown((s) => s + 50)} className="mt-3 h-9 w-full rounded-lg border border-line text-sm text-ink-2 hover:bg-raised">
          Show more ({rows.length - shown} left)
        </button>
      )}
    </div>
  );
}
