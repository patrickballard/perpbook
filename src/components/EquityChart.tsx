"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "@/lib/format";

type Point = { date: string; cumulative: number };

const H = 220;
const PAD = { l: 52, r: 12, t: 12, b: 26 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  return out;
}

export function EquityChart({ points }: { points: Point[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real width so text stays at its true size on phones.
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const vals = points.map((p) => p.cumulative);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const ticks = niceTicks(lo, hi);
    const yMin = Math.min(lo, ticks[0]);
    const yMax = Math.max(hi, ticks.at(-1)!);
    const x = (i: number) => PAD.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.cumulative).toFixed(1)}`).join("");
    const area = `${line}L${x(points.length - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`;
    const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
    return { x, y, line, area, ticks, labelIdx };
  }, [points, W]);

  if (!geo) return <p className="text-sm text-muted">No closed PnL yet.</p>;

  const last = points.at(-1)!.cumulative;
  const color = last >= 0 ? "var(--up)" : "var(--down)";

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const t = (sx - PAD.l) / (W - PAD.l - PAD.r);
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1)))));
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div className="relative" ref={box}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        // pan-y: a vertical swipe that starts on the chart still scrolls the page; a sideways one scrubs it.
        className="block max-w-full touch-pan-y"
        role="img"
        aria-label={`Cumulative PnL, ${money(last)} over ${points.length} trading days`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => setHover(null)}
      >
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(t)} y2={geo.y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
            <text x={PAD.l - 8} y={geo.y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="num">
              {money(t, { compact: true, sign: false }).replace("$", t < 0 ? "−$" : "$")}
            </text>
          </g>
        ))}
        {geo.labelIdx.map((i) => (
          <text key={i} x={geo.x(i)} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
            {new Date(points[i].date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </text>
        ))}
        <path d={geo.area} fill={color} fillOpacity={0.1} />
        <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hp && hover != null && (
          <g>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--axis)" strokeWidth={1} />
            <circle cx={geo.x(hover)} cy={geo.y(hp.cumulative)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && hover != null && (
        <div
          className="tip"
          style={{
            left: `${(geo.x(hover) / W) * 100}%`,
            top: 0,
            transform: `translateX(${hover > points.length / 2 ? "-105%" : "5%"})`,
          }}
        >
          <div className="text-muted">
            {new Date(hp.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </div>
          <div className={`num font-medium ${hp.cumulative >= 0 ? "up" : "down"}`}>{money(hp.cumulative)}</div>
        </div>
      )}
    </div>
  );
}
