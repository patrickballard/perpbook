"use client";

import { useState } from "react";
import type { Bucket } from "@/lib/engine/stats";
import { count, money, pct } from "@/lib/format";

const winRate = (b: Bucket) => (b.wins + b.losses ? b.wins / (b.wins + b.losses) : null);

/** Horizontal bars about a centre zero line: net PnL per category, sign by side and colour. */
export function HBars({ buckets, limit = 8 }: { buckets: Bucket[]; limit?: number }) {
  const rows = buckets.filter((b) => b.trades > 0).slice(0, limit);
  const max = Math.max(1, ...rows.map((b) => Math.abs(b.net)));
  if (!rows.length) return <p className="text-sm text-muted">No closed trades yet.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((b) => {
        const w = (Math.abs(b.net) / max) * 50;
        return (
          <div key={b.label} className="grid grid-cols-[96px_1fr_72px] items-center gap-2 text-sm group" title={`${count(b.trades, "trade")} · win rate ${pct(winRate(b))}`}>
            <span className="truncate text-ink-2" title={b.label}>{b.label}</span>
            <div className="relative h-5">
              <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--axis)]" />
              <div
                className="absolute top-0.5 bottom-0.5"
                style={{
                  left: b.net >= 0 ? "50%" : `${50 - w}%`,
                  width: `${Math.max(w, 0.6)}%`,
                  background: b.net >= 0 ? "var(--up)" : "var(--down)",
                  borderRadius: b.net >= 0 ? "0 4px 4px 0" : "4px 0 0 4px",
                }}
              />
            </div>
            <span className={`num text-right ${b.net >= 0 ? "up" : "down"}`}>{money(b.net, { compact: true, whole: true })}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical bars about zero for an ordered axis (hours, weekdays). */
export function VBars({ buckets, labelEvery = 1 }: { buckets: Bucket[]; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => Math.abs(b.net)));
  const W = 100 / buckets.length;
  const hb = hover != null ? buckets[hover] : null;
  return (
    <div className="relative">
      <div className="relative h-32 flex" onPointerLeave={() => setHover(null)}>
        <div className="absolute left-0 right-0 top-1/2 h-px bg-[var(--axis)]" />
        {buckets.map((b, i) => {
          const h = (Math.abs(b.net) / max) * 50;
          return (
            <div key={b.label} className="relative h-full" style={{ width: `${W}%` }} onPointerEnter={() => setHover(i)}>
              {b.trades > 0 && (
                <div
                  className="absolute"
                  style={{
                    left: "18%",
                    right: "18%",
                    top: b.net >= 0 ? `${50 - h}%` : "50%",
                    height: `${Math.max(h, 0.8)}%`,
                    background: b.net >= 0 ? "var(--up)" : "var(--down)",
                    borderRadius: b.net >= 0 ? "4px 4px 0 0" : "0 0 4px 4px",
                    opacity: hover == null || hover === i ? 1 : 0.45,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex mt-1">
        {buckets.map((b, i) => (
          <div key={b.label} className="text-center text-[10px] text-muted" style={{ width: `${W}%` }}>
            {i % labelEvery === 0 ? b.label : ""}
          </div>
        ))}
      </div>
      {hb && (
        // Centred over its bar, except at the ends, where it leans inwards so a phone doesn't cut it off.
        <div
          className="tip"
          style={{
            left: `${(hover! + 0.5) * W}%`,
            top: -8,
            transform: `translate(${hover! < buckets.length / 4 ? "-15%" : hover! >= (buckets.length * 3) / 4 ? "-85%" : "-50%"}, -100%)`,
          }}
        >
          <div className="text-muted">{hb.label}</div>
          <div className={`num font-medium ${hb.net >= 0 ? "up" : "down"}`}>{money(hb.net)}</div>
          <div className="text-muted num">
            {count(hb.trades, "trade")} · {pct(winRate(hb))} win
          </div>
        </div>
      )}
    </div>
  );
}
