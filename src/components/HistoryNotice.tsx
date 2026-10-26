import type { Storage } from "@/lib/history";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type Props = {
  storage: Storage;
  onTrack: () => void;
  tracking: boolean;
  trackError: string | null;
};

/**
 * Whether this wallet's history is saved. Hyperliquid's API docs only promise a wallet's latest
 * 10,000 fills (older ones were still served in Oct 2026), so a saved copy is insurance, and it
 * loads much faster than paging through Hyperliquid.
 */
export function HistoryNotice({ storage, onTrack, tracking, trackError }: Props) {
  if (storage.state === "off") return null;

  if (storage.state === "untracked") {
    return (
      <div className="card px-4 py-3 mb-4 text-sm flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-ink-2 mr-auto max-w-2xl">
          <span className="font-medium text-ink">Keep a copy of your history.</span> Hyperliquid&apos;s API only guarantees your latest 10,000 fills.
          perpbook can save every fill from now on, so your journal never depends on that, and it loads in seconds.
          {trackError && <div className="down mt-1">{trackError}</div>}
        </div>
        <button onClick={onTrack} disabled={tracking} className="h-9 px-3 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
          {tracking ? "Saving…" : "Keep my history"}
        </button>
      </div>
    );
  }

  const { gaps } = storage.status;
  if (!gaps.length) return null;
  return (
    <div className="card px-4 py-3 mb-4 text-sm text-ink-2">
      <span className="font-medium text-ink">Some history is missing.</span> Hyperliquid didn&apos;t return this wallet&apos;s fills from{" "}
      {gaps.map((g) => `${day(g.fromTime)} – ${day(g.toTime)}`).join(", ")} when perpbook saved it. Trades across those dates are marked partial.
    </div>
  );
}

export const savedSince = (storage: Storage) => (storage.state === "tracked" ? day(storage.status.trackedSince) : null);
