"use client";

import { useState } from "react";

// Follower count by day: one series, so no legend — the section title names it. Thin 2px line, recessive
// grid, crosshair + tooltip on hover, and a table view under it.

type Point = { date: string; followers: number };

const W = 720;
const H = 200;
const PAD = { l: 44, r: 16, t: 14, b: 26 };

const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function niceTicks(min: number, max: number, n = 4) {
  if (max === min) return [min];
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v));
  return out;
}

export function FollowerChart({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2)
    return (
      <div className="flex h-[200px] items-center justify-center px-6 text-center text-sm text-dim">
        {points.length === 1
          ? `${points[0].followers} followers on ${short(points[0].date)}. The trend line appears after the second daily snapshot.`
          : "The first follower snapshot is taken after 01:00 Beirut time."}
      </div>
    );

  const vals = points.map((p) => p.followers);
  const lo = Math.max(0, Math.min(...vals) - 1);
  const hi = Math.max(...vals) + 1;
  const ticks = niceTicks(lo, hi);
  const yMin = Math.min(lo, ticks[0]);
  const yMax = Math.max(hi, ticks.at(-1)!);
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.followers).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(points.length / 7);
  const h = hover != null ? points[hover] : null;
  const delta = h && hover! > 0 ? h.followers - points[hover! - 1].followers : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none"
        role="img"
        aria-label={`Followers from ${points[0].followers} on ${short(points[0].date)} to ${vals.at(-1)} on ${short(points.at(-1)!.date)}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-dim font-mono text-[11px]">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-dim text-[11px]">
              {short(p.date)}
            </text>
          ) : null,
        )}
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(vals.at(-1)!)} r="4" fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth="2" />
        {h && (
          <g pointerEvents="none">
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-line-2)" strokeWidth="1" />
            <circle cx={x(hover!)} cy={y(h.followers)} r="4.5" fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-line-2 bg-panel-2 px-2.5 py-1.5 text-[12px] shadow-lg"
          style={{ left: `${(x(hover!) / W) * 100}%`, transform: `translateX(${hover! > points.length / 2 ? "calc(-100% - 10px)" : "10px"})` }}
        >
          <div className="text-dim">{short(h.date)}</div>
          <div className="font-mono tabular-nums text-fg">
            {h.followers} followers
            {delta != null && <span className="ml-1.5 text-muted">({delta >= 0 ? "+" : ""}{delta})</span>}
          </div>
        </div>
      )}
      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer text-dim hover:text-fg">Show as table</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead className="text-[11px] uppercase tracking-[0.08em] text-dim">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Followers</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums text-muted">
            {points.map((p) => (
              <tr key={p.date}>
                <td className="py-0.5 font-sans">{short(p.date)}</td>
                <td className="py-0.5 text-right">{p.followers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
