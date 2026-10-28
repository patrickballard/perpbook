import type { Storage } from "@/lib/history";
import { day } from "@/lib/format";
import { STORAGE_FULL, TOO_MANY_FILLS } from "@/lib/sync/messages";

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
          <span className="font-medium text-ink">Your wallet? Save its history.</span> Hyperliquid&apos;s API only guarantees a wallet&apos;s latest 10,000
          fills. perpbook can save every fill from now on, so your journal never depends on that, and it loads in seconds.
          {trackError && <div className="down mt-1">{trackError}</div>}
        </div>
        <button onClick={onTrack} disabled={tracking} className="h-9 px-3 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
          {tracking ? "Saving…" : "Save history"}
        </button>
      </div>
    );
  }

  const { gaps, syncError } = storage.status;
  // Saving has stopped for good (other errors are retried): say so, or "history saved" reads as up to date.
  const stopped = syncError?.startsWith(TOO_MANY_FILLS)
    ? "it has more fills than perpbook saves per wallet"
    : syncError?.startsWith(STORAGE_FULL)
      ? "perpbook's free storage is full"
      : null;
  if (!gaps.length && !stopped) return null;
  return (
    <div className="card px-4 py-3 mb-4 text-sm text-ink-2 space-y-1">
      {stopped && (
        <p>
          <span className="font-medium text-ink">perpbook has stopped saving this wallet&apos;s new fills:</span> {stopped}. Newer fills still load live from Hyperliquid.
        </p>
      )}
      {gaps.length > 0 && (
        <p>
          <span className="font-medium text-ink">Some history is missing.</span> Hyperliquid didn&apos;t return this wallet&apos;s fills from{" "}
          {gaps.map((g) => `${day(g.fromTime)} – ${day(g.toTime)}`).join(", ")} when perpbook saved it. Trades across those dates are marked partial.
        </p>
      )}
    </div>
  );
}

export const savedSince = (storage: Storage) => (storage.state === "tracked" ? day(storage.status.trackedSince) : null);
