// The downloadable PnL card: a 1200×630 image of a wallet's record, drawn in the browser so it
// matches exactly what the dashboard shows. Every card carries perpbook's name and address,
// so each one a trader posts points back here.

import type { Reconciliation, TradeStats } from "./engine/stats";
import { moneyHeadline, pct, ratio } from "./format";

export type CardData = {
  label: string; // "Demo account" or a short address
  net: number;
  period: string | null; // "12 Aug – 26 Oct 2026"
  stats: { label: string; value: string }[];
  series: number[]; // cumulative net PnL by day, from 0
  matches: boolean;
  host: string;
};

const day = (iso: string, withYear: boolean) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

export function cardData(input: {
  label: string;
  stats: TradeStats;
  equity: { date: string; cumulative: number }[];
  reconciliation: Reconciliation | null;
  host: string;
}): CardData {
  const { stats, equity } = input;
  const first = equity[0]?.date;
  const last = equity.at(-1)?.date;
  return {
    label: input.label,
    net: stats.net,
    period: first && last ? `${day(first, first.slice(0, 4) !== last.slice(0, 4))} – ${day(last, true)}` : null,
    stats: [
      { label: "Win rate", value: pct(stats.winRate) },
      { label: "Profit factor", value: ratio(stats.profitFactor) },
      { label: "Trades", value: stats.trades.toLocaleString("en-GB") },
    ],
    series: [0, ...equity.map((p) => p.cumulative)],
    matches: input.reconciliation?.matches ?? false,
    host: input.host,
  };
}

// perpbook's dark theme (globals.css), which reads best in social feeds.
const C = { page: "#0d0d0d", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", line: "#2c2c2a", accent: "#3987e5", up: "#3fc794", down: "#f07f7f" };
export const CARD_W = 1200;
export const CARD_H = 630;

/** Draw the card at `scale`× onto a canvas. `sans` and `mono` are CSS font-family values. */
export function drawCard(canvas: HTMLCanvasElement, d: CardData, fonts: { sans: string; mono: string }, scale = 2) {
  canvas.width = CARD_W * scale;
  canvas.height = CARD_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const tone = d.net > 0.004 ? C.up : d.net < -0.004 ? C.down : C.ink;
  const pad = 64;
  const right = CARD_W - pad;

  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.textBaseline = "alphabetic";

  // Header: wordmark and whose card this is.
  ctx.font = `600 34px ${fonts.sans}`;
  ctx.fillStyle = C.ink;
  ctx.fillText("perpbook", pad, 98);
  const markW = ctx.measureText("perpbook").width;
  ctx.fillStyle = C.accent;
  ctx.fillText(".", pad + markW, 98);
  ctx.font = `500 26px ${fonts.mono}`;
  ctx.fillStyle = C.ink2;
  ctx.textAlign = "right";
  ctx.fillText(d.label, right, 96);
  ctx.textAlign = "left";

  // What the headline number is.
  ctx.font = `400 26px ${fonts.sans}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(`Net PnL after fees and funding${d.period ? ` · ${d.period}` : ""}`, pad, 172);

  // The headline number, shrunk if it would ever run out of room.
  const net = moneyHeadline(d.net);
  let size = 112;
  ctx.font = `500 ${size}px ${fonts.mono}`;
  while (ctx.measureText(net).width > right - pad && size > 48) ctx.font = `500 ${(size -= 4)}px ${fonts.mono}`;
  ctx.fillStyle = tone;
  ctx.fillText(net, pad - 4, 286);

  // Three stats.
  d.stats.forEach((s, i) => {
    const x = pad + i * 260;
    ctx.font = `400 24px ${fonts.sans}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(s.label, x, 346);
    ctx.font = `500 40px ${fonts.mono}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(s.value, x, 394);
  });

  // Equity sparkline with a soft fill.
  const top = 428;
  const h = 96;
  const w = right - pad;
  const lo = Math.min(...d.series);
  const span = Math.max(...d.series) - lo || 1;
  const pts = (d.series.length > 1 ? d.series : [0, 0]).map((v, i, a) => [pad + (i / (a.length - 1)) * w, top + h - ((v - lo) / span) * h] as const);
  const grad = ctx.createLinearGradient(0, top, 0, top + h);
  grad.addColorStop(0, `${tone}33`);
  grad.addColorStop(1, `${tone}00`);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.lineTo(pts.at(-1)![0], top + h);
  ctx.lineTo(pts[0][0], top + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = tone;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Footer.
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, 554, w, 1);
  ctx.font = `400 22px ${fonts.sans}`;
  ctx.fillStyle = d.matches ? C.up : C.muted;
  ctx.fillText(d.matches ? "✓ Matches Hyperliquid's own PnL" : "Every trade rebuilt from Hyperliquid", pad, 594);
  ctx.fillStyle = C.muted;
  ctx.textAlign = "right";
  ctx.fillText(d.host, right, 594);
  ctx.textAlign = "left";
}
