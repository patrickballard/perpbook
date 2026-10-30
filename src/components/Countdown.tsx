"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const UNITS = [
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["m", 60_000],
  ["s", 1_000],
] as const;

const everySecond = (tick: () => void) => {
  const id = setInterval(tick, 1_000);
  return () => clearInterval(id);
};
// Whole seconds, so the value only changes when the display would.
const thisSecond = () => Math.floor(Date.now() / 1_000) * 1_000;

/**
 * A ticking "2d 03h 14m 09s" pill counting down to `to`. The page around it is cached for up to 10
 * minutes, so the time comes from the visitor's clock, not the render; at zero it says `done` and
 * keeps fetching the page again until the new one arrives.
 */
export function Countdown({ to, label, done }: { to: number; label: string; done: string }) {
  const router = useRouter();
  // null while rendering on the server: the cached HTML would show a stale time.
  const now = useSyncExternalStore(everySecond, thisSecond, () => null);
  const left = now == null ? null : Math.max(0, to - now);
  const over = left === 0;

  useEffect(() => {
    if (!over) return;
    router.refresh();
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [over, router]);

  return (
    <span role="timer" aria-label={label} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface pl-2.5 pr-3 h-7 num text-ink">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-accent shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <circle cx="8" cy="9" r="5.75" />
        <path d="M8 6v3l1.75 1.25M6.5 1.75h3" />
      </svg>
      {over ? (
        <span className="text-ink-2">{done}</span>
      ) : (
        <span className="inline-flex items-baseline gap-1.5">
          {UNITS.map(([unit, ms], i) => {
            const value = left == null ? null : Math.floor((i ? left % UNITS[i - 1][1] : left) / ms);
            return (
              <span key={unit}>
                <span className="font-semibold">{value == null ? "––" : i ? String(value).padStart(2, "0") : value}</span>
                <span className="text-muted">{unit}</span>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
