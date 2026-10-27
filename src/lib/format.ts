export function money(
  v: number | null | undefined,
  opts: { compact?: boolean; sign?: boolean; whole?: boolean } = {},
): string {
  const { compact = false, sign = true, whole = false } = opts;
  if (v == null || Number.isNaN(v)) return "–";
  const s = !sign ? "" : v > 0.004 ? "+" : v < -0.004 ? "−" : "";
  const a = Math.abs(v);
  let body: string;
  // Switch unit where rounding would otherwise print "1000k" or "1000M".
  if (compact && a >= 999.5e6) body = `${(a / 1e9).toFixed(a >= 9.95e9 ? 0 : 1)}B`;
  else if (compact && a >= 999_500) body = `${(a / 1e6).toFixed(a >= 9.95e6 ? 0 : 1)}M`;
  else if (compact && a >= 10_000) body = `${(a / 1000).toFixed(0)}k`;
  else if (compact && a >= 1000) body = `${(a / 1000).toFixed(1)}k`;
  // Whole dollars only from $10: below that, rounding turns +$0.19 into "+$0".
  else if ((compact && a >= 100) || (whole && a >= 10)) body = a.toFixed(0);
  else body = a.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s}$${body}`;
}

export const pct = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(digits)}%`;

export const ratio = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "–" : v === Infinity ? "∞" : v.toFixed(2);

export function price(v: number | null | undefined): string {
  if (v == null) return "–";
  if (v >= 1000) return v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  if (v >= 1) return v.toFixed(v >= 100 ? 2 : 3);
  return v.toPrecision(4);
}

export function size(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return a.toLocaleString("en-GB", { maximumFractionDigits: 0 });
  return +a.toPrecision(4) + "";
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return "–";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const tone = (v: number) => (v > 0.004 ? "up" : v < -0.004 ? "down" : "flat");

export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function when(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** For tight spaces like calendar cells: cents under $1, one decimal under $10, then as money(). */
export function moneyShort(v: number): string {
  const s = v > 0.004 ? "+" : v < -0.004 ? "−" : "";
  const a = Math.abs(v);
  if (a < 0.995) return `${s}${Math.round(a * 100)}¢`;
  if (a < 9.95) return `${s}$${a.toFixed(1)}`;
  return money(v, { compact: true, whole: true });
}

/**
 * A headline amount that fits a phone-width card: compact from $100k ("−$23.39M"), whole
 * dollars from $10k ("+$48,210"), exact below.
 */
export function moneyHeadline(v: number): string {
  const s = v > 0.004 ? "+" : v < -0.004 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e5) return `${s}$${(a / 1e3).toFixed(1)}k`;
  if (a >= 1e4) return `${s}$${Math.round(a).toLocaleString("en-GB")}`;
  return money(v);
}
