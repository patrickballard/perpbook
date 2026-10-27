import { hasFullHistory, type Reconciliation } from "@/lib/engine/stats";
import { money } from "@/lib/format";

// One unbreakable amount, so a narrow screen never strands "−" on the line above "$6,043,595.17".
const Amount = ({ v, sign = true }: { v: number; sign?: boolean }) => <span className="whitespace-nowrap">{money(v, { sign })}</span>;

const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** How our numbers add up to Hyperliquid's own all-time PnL, or why they don't yet. */
export function Reconcile({ r, firstFillTime, hyperliquidSince }: { r: Reconciliation; firstFillTime: number | null; hyperliquidSince: number | null }) {
  const sum = (
    <span className="num">
      <Amount v={r.realised} /> realised {r.unrealised < 0 ? "−" : "+"} <Amount v={Math.abs(r.unrealised)} sign={false} /> unrealised = <Amount v={r.perpbook} />
    </span>
  );
  if (r.matches) {
    return (
      <p className="text-xs text-ink-2 px-1">
        <span className="up font-medium">✓ Matches Hyperliquid.</span> {sum}, and Hyperliquid&apos;s all-time perps PnL is{" "}
        <span className="num"><Amount v={r.hyperliquid} /></span>.
      </p>
    );
  }
  const gap = <span className="num"><Amount v={Math.abs(r.difference)} sign={false} /></span>;
  if (hasFullHistory(firstFillTime, hyperliquidSince)) {
    return (
      <p className="text-xs text-ink-2 px-1">
        Hyperliquid&apos;s all-time perps PnL is <span className="num"><Amount v={r.hyperliquid} /></span>; perpbook&apos;s history comes to {sum}. perpbook has
        this wallet&apos;s full history, so the {gap} difference comes from activity it doesn&apos;t count yet, such as trading through a vault.{" "}
        <a href="https://github.com/patrickballard/perpbook/discussions" className="underline underline-offset-2 hover:text-ink">
          Tell us about this wallet
        </a>
        .
      </p>
    );
  }
  return (
    <p className="text-xs text-ink-2 px-1">
      Hyperliquid&apos;s all-time perps PnL is <span className="num"><Amount v={r.hyperliquid} /></span>; perpbook&apos;s history comes to {sum}. The {gap} difference is
      PnL from before {firstFillTime ? day(firstFillTime) : "the oldest fill perpbook has"}, which Hyperliquid no longer serves fills for.
    </p>
  );
}
