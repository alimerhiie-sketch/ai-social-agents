import React from "react";
import { AbsoluteFill, Img, interpolate, random, useCurrentFrame } from "remotion";
import { display, withAlpha } from "../../brand";
import type { Beat } from "../../types";
import type { Look } from "../looks";
import { pr } from "../theme";

// One photoreal shot (a free Flux frame) brought to life like live action: a real camera move over the beat,
// handheld shake, motion blur on fast moves, a film grade, foreground dust for depth, and an on-image callout.

const W = 1080;
const H = 1920;
const YELLOW = "#FFC400";

type Move = NonNullable<Beat["move"]>;

/** Smooth pseudo-noise for handheld shake (sum of incommensurate sines). */
const wobble = (t: number, seed: number) => Math.sin(t * 0.31 + seed) * 0.6 + Math.sin(t * 0.73 + seed * 2.1) * 0.3 + Math.sin(t * 1.37 + seed * 3.7) * 0.1;

function camera(move: Move, k: number, f: number) {
  // k: 0→1 across the beat (eased). Shots are short, so the moves are bold.
  switch (move) {
    case "pull-out":
      return { s: 1.34 - 0.2 * k, x: 0, y: 0, r: 0 };
    case "pan-left":
      return { s: 1.22, x: 70 - 140 * k, y: 0, r: 0 };
    case "pan-right":
      return { s: 1.22, x: -70 + 140 * k, y: 0, r: 0 };
    case "tilt-up":
      return { s: 1.22, x: 0, y: -90 + 180 * k, r: 0 };
    case "tilt-down":
      return { s: 1.22, x: 0, y: 90 - 180 * k, r: 0 };
    case "orbit":
      return { s: 1.2 + 0.08 * k, x: -40 + 80 * k, y: 0, r: -2.2 + 4.4 * k };
    case "crash-zoom": {
      const c = pr(f, 0, 7);
      return { s: 1.75 - 0.5 * c + 0.06 * k, x: 0, y: 0, r: 0 };
    }
    default: // push-in
      return { s: 1.12 + 0.22 * k, x: 0, y: 0, r: 0 };
  }
}

export function ShotBeat({ beat, look, d, seed, first }: { beat: Beat; look: Look; d: number; seed: number; first: boolean }) {
  const f = useCurrentFrame();
  const move: Move = beat.move ?? "push-in";
  const t = Math.min(1, f / Math.max(1, d + 6));
  const k = 1 - Math.pow(1 - t, 2.2); // decelerating move, like an operator easing in
  const c = camera(move, k, f);
  const prev = camera(move, 1 - Math.pow(1 - Math.min(1, Math.max(0, f - 1) / Math.max(1, d + 6)), 2.2), f - 1);
  const speed = Math.abs(c.s - prev.s) * 900 + Math.abs(c.x - prev.x) + Math.abs(c.y - prev.y);
  const blur = Math.min(10, speed * 0.6);
  const sx = wobble(f, seed) * 6;
  const sy = wobble(f + 40, seed + 1) * 5;
  const sr = wobble(f + 90, seed + 2) * 0.35;
  // frame 1 of the reel is already the hook: no fade
  const enter = first ? 1 : pr(f, 0, 3);

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${c.x + sx}px, ${c.y + sy}px) scale(${c.s}) rotate(${c.r + sr}deg)`, filter: blur > 0.6 ? `blur(${blur}px)` : undefined, opacity: enter }}>
        {beat.imageSrc ? (
          <Img src={beat.imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.08) saturate(1.06) brightness(1.02)" }} />
        ) : (
          <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #2a2a2a, #050505)" }} />
        )}
      </AbsoluteFill>
      <Callout beat={beat} f={f} d={d} cam={{ ...c, sx, sy }} />
      <Dust f={f} seed={seed} />
      <Grade f={f} look={look} />
    </AbsoluteFill>
  );
}

/** Foreground dust catching the light, moving faster than the plate: cheap 2.5D depth. */
function Dust({ f, seed }: { f: number; seed: number }) {
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {Array.from({ length: 14 }, (_, i) => {
        const r = (k: string) => random(`dust${seed}-${i}-${k}`);
        const z = 0.4 + r("z") * 1.2;
        const x = ((r("x") * W + f * (1.5 + z * 3)) % (W + 80)) - 40;
        const y = r("y") * H + Math.sin(f / (18 + r("w") * 20) + i) * 30;
        const size = 2 + z * 5;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: size, height: size, borderRadius: "50%", background: "#FFF3D6", opacity: 0.12 + z * 0.18, filter: `blur(${z > 1 ? 2 : 0.5}px)` }} />;
      })}
    </AbsoluteFill>
  );
}

/** Film grade over everything: teal-orange split, vignette, grain that changes every 2 frames. */
export function Grade({ f, look }: { f: number; look: Look }) {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,40,60,0.18) 0%, rgba(0,0,0,0) 40%, rgba(60,30,0,0.14) 100%)", mixBlendMode: "soft-light" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 48%, rgba(0,0,0,0.62) 100%)" }} />
      <AbsoluteFill style={{ opacity: 0.11, mixBlendMode: "overlay" }}>
        <svg width="100%" height="100%">
          <filter id={`cg${Math.floor(f / 2) % 6}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves={2} seed={Math.floor(f / 2) % 6} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#cg${Math.floor(f / 2) % 6})`} />
        </svg>
      </AbsoluteFill>
      <div style={{ display: "none" }}>{look.id}</div>
    </AbsoluteFill>
  );
}

/** Where a point in the image ends up on screen after the camera move. */
function project(at: { x: number; y: number }, cam: { s: number; x: number; y: number; sx: number; sy: number }) {
  return { x: W / 2 + (at.x * W - W / 2) * cam.s + cam.x + cam.sx, y: H / 2 + (at.y * H - H / 2) * cam.s + cam.y + cam.sy };
}

function Callout({ beat, f, d, cam }: { beat: Beat; f: number; d: number; cam: { s: number; x: number; y: number; r: number; sx: number; sy: number } }) {
  const kind = beat.callout ?? "none";
  if (kind === "none") return null;
  const at = { x: Math.min(0.9, Math.max(0.1, beat.at?.x ?? 0.5)), y: Math.min(0.85, Math.max(0.15, beat.at?.y ?? 0.45)) };
  const p = project(at, cam);
  const a = pr(f, 3, 9);
  // short labels only (≤ 4 words): a sentence belongs in the captions, not on a tag
  const raw = (beat.text || "").replace(/\*/g, "").trim();
  const label = raw.split(/\s+/).length <= 4 && raw.length <= 26 ? raw : "";

  if (kind === "ring") {
    const r = 150;
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={YELLOW} strokeWidth={10} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - a} transform={`rotate(-90 ${p.x} ${p.y})`} style={{ filter: `drop-shadow(0 0 14px ${withAlpha(YELLOW, 0.7)})` }} />
          <circle cx={p.x} cy={p.y} r={r + 22 + Math.sin(f / 4) * 4} fill="none" stroke={YELLOW} strokeOpacity={0.35 * a} strokeWidth={3} />
        </svg>
        {label && <Tag text={label} x={p.x} y={Math.min(960, p.y + r + 40)} a={a} />}
      </AbsoluteFill>
    );
  }

  if (kind === "xray") {
    // a lens that sees through: the same frame, inverted to an x-ray, inside a ring with a scan line
    const r = 230 * a;
    const scan = ((f * 9) % (r * 2 + 1)) - r;
    return (
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {beat.imageSrc && (
          <AbsoluteFill style={{ clipPath: `circle(${r}px at ${p.x}px ${p.y}px)` }}>
            <AbsoluteFill style={{ transform: `translate(${cam.x + cam.sx}px, ${cam.y + cam.sy}px) scale(${cam.s}) rotate(${cam.r}deg)` }}>
              <Img src={beat.imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) invert(1) contrast(1.6) brightness(1.1) sepia(1) hue-rotate(170deg) saturate(2.4)" }} />
            </AbsoluteFill>
            <div style={{ position: "absolute", left: p.x - r, width: r * 2, top: p.y + scan, height: 6, background: withAlpha("#9FE8FF", 0.85), boxShadow: "0 0 24px 8px rgba(120,220,255,0.6)" }} />
          </AbsoluteFill>
        )}
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="#9FE8FF" strokeWidth={6} />
          <circle cx={p.x} cy={p.y} r={r + 14} fill="none" stroke={YELLOW} strokeWidth={3} strokeDasharray="10 14" transform={`rotate(${f * 2} ${p.x} ${p.y})`} />
        </svg>
        {label && <Tag text={label} x={p.x} y={Math.min(960, p.y + r + 46)} a={a} />}
      </AbsoluteFill>
    );
  }

  if (kind === "counter") {
    const m = (beat.number || "").match(/^([^\d]*)([\d.,]+)(.*)$/);
    const target = m ? parseFloat(m[2].replace(/,/g, "")) : NaN;
    // small numbers land with a punch; only big ones count up
    const kk = Number.isFinite(target) && target < 20 ? 1 : pr(f, 2, Math.max(12, d - 6));
    const dec = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
    const shown = m && Number.isFinite(target) ? `${m[1]}${(target * kk).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })}${m[3]}` : beat.number;
    return (
      <AbsoluteFill style={{ pointerEvents: "none", alignItems: "center", justifyContent: "center", paddingBottom: 260 }}>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: (beat.number || "").length > 7 ? 150 : 200, color: YELLOW, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums", textShadow: "0 8px 40px rgba(0,0,0,0.8), 0 0 2px #000", transform: `scale(${0.9 + 0.1 * pr(f, 0, 6)})` }}>{shown}</div>
        {label && <div style={{ fontFamily: display, fontWeight: 800, fontSize: 54, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.04em", textShadow: "0 4px 24px rgba(0,0,0,0.9)", opacity: pr(f, 6, 8) }}>{label}</div>}
      </AbsoluteFill>
    );
  }

  // arrow / label: a tag off to the side, with an arrow that draws to the point
  const side = at.x > 0.5 ? -1 : 1;
  const tx = Math.min(W - 200, Math.max(200, p.x + side * 300));
  // above the caption band (y ≈ 1080–1420)
  const ty = Math.min(900, Math.max(380, p.y - 260));
  const len = Math.hypot(p.x - tx, p.y - (ty + 50));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {kind === "arrow" && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <marker id={`ah${Math.round(p.x)}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={YELLOW} />
            </marker>
          </defs>
          <path d={`M${tx} ${ty + 50} Q${(tx + p.x) / 2 + side * 60} ${(ty + p.y) / 2 - 40} ${p.x} ${p.y}`} fill="none" stroke={YELLOW} strokeWidth={9} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - a} markerEnd={a > 0.9 ? `url(#ah${Math.round(p.x)})` : undefined} style={{ filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.6))" }} />
          <circle cx={p.x} cy={p.y} r={12 * a} fill={YELLOW} />
        </svg>
      )}
      {kind === "label" && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <line x1={tx} y1={ty + 50} x2={tx + (p.x - tx) * a} y2={ty + 50 + (p.y - ty - 50) * a} stroke="#FFFFFF" strokeWidth={4} />
          <circle cx={p.x} cy={p.y} r={14 * a} fill="none" stroke="#FFFFFF" strokeWidth={4} />
          <circle cx={p.x} cy={p.y} r={5 * a} fill={YELLOW} />
        </svg>
      )}
      {label && <Tag text={label} x={tx} y={ty} a={pr(f, 0, 7)} len={len} />}
    </AbsoluteFill>
  );
}

function Tag({ text, x, y, a }: { text: string; x: number; y: number; a: number; len?: number }) {
  // keep the whole tag on screen: estimate its width from the text
  const half = (text.length * 30 + 60) / 2;
  x = Math.min(W - half - 36, Math.max(half + 36, x));
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, 0) scale(${0.85 + 0.15 * a})`,
        opacity: a,
        padding: "14px 26px",
        background: YELLOW,
        color: "#111111",
        fontFamily: display,
        fontWeight: 800,
        fontSize: 46,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        borderRadius: 6,
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      }}
    >
      {text}
    </div>
  );
}

/** Full-screen white flash for the twist (2–3 frames). */
export function Flash({ f }: { f: number }) {
  const o = interpolate(f, [0, 1, 5], [0.95, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: "#FFFFFF", opacity: o, pointerEvents: "none" }} />;
}
