"use client";

import { useMemo, useState } from "react";
import type { Day } from "@/lib/engine/stats";
import { money, moneyShort } from "@/lib/format";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month grid of daily net PnL. Shade = size of the day relative to the biggest day; sign carries direction. */
export function PnlCalendar({ days }: { days: Day[] }) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const latest = days.at(-1)?.date ?? new Date().toLocaleDateString("en-CA");
  // Show the newest month until the visitor picks another, so a refresh that brings in a new
  // month moves the calendar to it instead of leaving it on the month it opened on.
  const [picked, setPicked] = useState<string | null>(null);
  const cursor = picked ?? latest.slice(0, 7);

  const [y, m] = cursor.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const key = `${cursor}-${String(i + 1).padStart(2, "0")}`;
    return { key, day: i + 1, d: byDate.get(key) };
  });
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  const monthNet = monthDays.reduce((s, x) => s + (x.d?.net ?? 0), 0);
  const greenDays = monthDays.filter((x) => (x.d?.net ?? 0) > 0.004).length;
  const redDays = monthDays.filter((x) => (x.d?.net ?? 0) < -0.004).length;

  const shift = (k: number) => {
    const d = new Date(y, m - 1 + k, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setPicked(month === latest.slice(0, 7) ? null : month); // back on the newest: follow it again
  };
  const firstMonth = days[0]?.date.slice(0, 7) ?? cursor;
  const lastMonth = latest.slice(0, 7);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <div>
          <div className="font-medium">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
          <div className="text-xs text-muted num">
            <span className={monthNet >= 0 ? "up" : "down"}>{money(monthNet)}</span> · {greenDays} green · {redDays} red
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => shift(-1)}
            disabled={cursor <= firstMonth}
            className="h-8 w-8 rounded-lg border border-line text-ink-2 hover:bg-raised disabled:opacity-30"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            onClick={() => shift(1)}
            disabled={cursor >= lastMonth}
            className="h-8 w-8 rounded-lg border border-line text-ink-2 hover:bg-raised disabled:opacity-30"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w) => (
          <div key={w} className="eyebrow pb-1">
            {w}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead${i}`} />
        ))}
        {monthDays.map(({ key, day, d }) => {
          const net = d?.net ?? 0;
          const active = d && Math.abs(net) > 0.004;
          const strength = active ? 0.18 + 0.62 * Math.min(1, Math.abs(net) / maxAbs) : 0;
          return (
            <div
              key={key}
              title={active ? `${key}: ${money(net)} (fees ${money(-d!.fees)}, funding ${money(d!.funding)})` : key}
              className="relative aspect-square rounded-md flex flex-col items-start justify-between p-1 sm:p-1.5 text-left"
              style={{
                background: active
                  ? `color-mix(in oklab, ${net > 0 ? "var(--up)" : "var(--down)"} ${Math.round(strength * 100)}%, var(--surface))`
                  : "var(--flat)",
                opacity: active ? 1 : 0.55,
              }}
            >
              <span className="text-[10px] sm:text-[11px] text-ink-2 leading-none">{day}</span>
              {active && (
                <span className="num text-[10px] sm:text-[11px] font-medium leading-none text-ink truncate w-full">
                  {moneyShort(net)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
