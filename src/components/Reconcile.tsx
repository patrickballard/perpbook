import type { Reconciliation } from "@/lib/engine/stats";
import { money } from "@/lib/format";

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** How our numbers add up to Hyperliquid's own all-time PnL, or why they don't yet. */
export function Reconcile({ r, firstFillTime }: { r: Reconciliation; firstFillTime: number | null }) {
  const sum = (
    <span className="num">
      {money(r.realised)} realised {r.unrealised < 0 ? "−" : "+"} {money(Math.abs(r.unrealised), { sign: false })} unrealised = {money(r.perpbook)}
    </span>
  );
  if (r.matches) {
    return (
      <p className="text-xs text-ink-2 px-1">
        <span className="up font-medium">✓ Matches Hyperliquid.</span> {sum}, and Hyperliquid&apos;s all-time perps PnL is{" "}
        <span className="num">{money(r.hyperliquid)}</span>.
      </p>
    );
  }
  return (
    <p className="text-xs text-ink-2 px-1">
      Hyperliquid&apos;s all-time perps PnL is <span className="num">{money(r.hyperliquid)}</span>; perpbook&apos;s history comes to {sum}. The{" "}
      <span className="num">{money(Math.abs(r.difference), { sign: false })}</span> difference is PnL from before{" "}
      {firstFillTime ? day(firstFillTime) : "the oldest fill perpbook has"}, which Hyperliquid no longer serves fills for.
    </p>
  );
}
