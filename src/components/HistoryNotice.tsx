import type { Storage } from "@/lib/history";

const FILL_LIMIT = 10_000;
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type Props = {
  storage: Storage;
  rawFillCount: number;
  onTrack: () => void;
  tracking: boolean;
  trackError: string | null;
};

/** What happens to this wallet's history: dropping off, savable, saved, or saved with holes. */
export function HistoryNotice({ storage, rawFillCount, onTrack, tracking, trackError }: Props) {
  const nearLimit = rawFillCount >= FILL_LIMIT * 0.9;
  const limitLine = `Hyperliquid only keeps your most recent ${FILL_LIMIT.toLocaleString("en-GB")} fills${nearLimit ? `, and you're at ${rawFillCount.toLocaleString("en-GB")}` : ""}.`;

  if (storage.state === "off") {
    if (!nearLimit) return null;
    return <div className="card px-4 py-3 mb-4 text-sm text-ink-2">{limitLine} Older trades will drop out of this view.</div>;
  }

  if (storage.state === "untracked") {
    return (
      <div className="card px-4 py-3 mb-4 text-sm flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-ink-2 mr-auto max-w-2xl">
          <span className="font-medium text-ink">Keep your full history.</span> {limitLine} perpbook can save every fill from now on, so older
          trades never drop off.
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
      <span className="font-medium text-ink">Some history is missing.</span> More than {FILL_LIMIT.toLocaleString("en-GB")} fills happened between two saves, so
      Hyperliquid no longer had the fills from {gaps.map((g) => `${day(g.fromTime)} – ${day(g.toTime)}`).join(", ")}. Trades across those dates are marked partial.
    </div>
  );
}

export const savedSince = (storage: Storage) => (storage.state === "tracked" ? day(storage.status.trackedSince) : null);
