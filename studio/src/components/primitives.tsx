import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { body, easeIn, easeOut, ENTER, EXIT, STAGGER, withAlpha } from "../brand";
import type { Palette } from "../types";

/** 0→1 progress of an element that starts entering at `start`. */
export function useEnter(start: number, length = ENTER) {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + length], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** 1→0 as the scene clears in its last EXIT frames. `total` = scene length; Infinity for stills. */
export function useExit(total: number) {
  const frame = useCurrentFrame();
  if (!Number.isFinite(total)) return 1;
  return interpolate(frame, [total - EXIT, total], [1, 0], { easing: easeIn, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** Wraps a scene: everything inside lifts and blurs out together at the end. */
export function SceneExit({ total, children }: { total: number; children: React.ReactNode }) {
  const out = useExit(total);
  return (
    <AbsoluteFill style={{ opacity: out, transform: `translateY(${(1 - out) * -28}px)`, filter: `blur(${(1 - out) * 10}px)` }}>
      {children}
    </AbsoluteFill>
  );
}

/**
 * Words blur in one after another. `*word*` in the text is emphasised in the accent colour.
 */
export function Reveal({
  text,
  start = 0,
  style,
  palette,
  stagger = STAGGER,
}: {
  text: string;
  start?: number;
  style: React.CSSProperties;
  palette: Palette;
  stagger?: number;
}) {
  const frame = useCurrentFrame();
  const tokens = tokenize(text);
  return (
    <div style={{ ...style, display: "flex", flexWrap: "wrap", columnGap: "0.26em" }}>
      {tokens.map((t, i) => {
        const s = start + i * stagger;
        const p = interpolate(frame, [s, s + ENTER], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              opacity: p,
              transform: `translateY(${(1 - p) * 0.38}em)`,
              filter: `blur(${(1 - p) * 9}px)`,
              color: t.em ? palette.soft : undefined,
            }}
          >
            {t.word}
          </span>
        );
      })}
    </div>
  );
}

function tokenize(text: string) {
  // "*two words*" stays emphasised across both words
  const out: { word: string; em: boolean }[] = [];
  let em = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let w = raw;
    const opens = w.startsWith("*");
    if (opens) {
      em = true;
      w = w.slice(1);
    }
    const closes = w.endsWith("*") || /\*[.,!?:;'"]+$/.test(w);
    w = w.replace(/\*(?=[.,!?:;'"]*$)/, "");
    out.push({ word: w, em });
    if (closes) em = false;
  }
  return out;
}

/** Small tracked uppercase label with a pill before it. */
export function Kicker({ text, start = 0, palette, size = 30 }: { text: string; start?: number; palette: Palette; size?: number }) {
  const p = useEnter(start);
  if (!text) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.55, opacity: p, transform: `translateX(${(1 - p) * -24}px)` }}>
      <div style={{ width: size * 1.6 * p, height: size * 0.42, borderRadius: 999, background: palette.soft }} />
      <div style={{ fontFamily: body, fontWeight: 600, fontSize: size, letterSpacing: "0.2em", textTransform: "uppercase", color: palette.soft }}>
        {text}
      </div>
    </div>
  );
}

/** A rule that draws from the left. */
export function Hairline({ start = 0, palette, width = "100%", opacity = 0.35 }: { start?: number; palette: Palette; width?: number | string; opacity?: number }) {
  const p = useEnter(start, ENTER + 8);
  return <div style={{ width, height: 2, background: withAlpha(palette.ink, opacity), transformOrigin: "left", transform: `scaleX(${p})` }} />;
}

/** The brand field: blue gradient, a slow drifting glow, edit-timeline tracks and grain. */
export function Field({ palette, still = false }: { palette: Palette; still?: boolean }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = still ? 40 : frame;
  const gx = 68 + Math.sin(t / 90) * 10;
  const gy = 28 + Math.cos(t / 110) * 6;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, ${palette.field} 0%, ${palette.field} 38%, ${palette.deep} 100%)` }}>
      <AbsoluteFill
        style={{ background: `radial-gradient(circle at ${gx}% ${gy}%, ${withAlpha(palette.soft, 0.33)} 0%, ${withAlpha(palette.soft, 0)} 46%)` }}
      />
      <AbsoluteFill
        style={{ background: `radial-gradient(circle at 15% 92%, ${withAlpha(palette.deep, 0.75)} 0%, ${withAlpha(palette.deep, 0)} 55%)` }}
      />
      <Tracks palette={palette} width={width} height={height} t={t} />
      <Grain seed={still ? 3 : Math.floor(frame / 2)} />
    </AbsoluteFill>
  );
}

/** Faint edit-timeline rows in the bottom-left band — the AMX clip pills, quietly sliding. */
function Tracks({ palette, width, height, t }: { palette: Palette; width: number; height: number; t: number }) {
  const rows = [0, 1, 2, 3];
  return (
    <AbsoluteFill style={{ opacity: 0.16 }}>
      {rows.map((r) => {
        const y = height - 250 + r * 34;
        let x = -160 + ((t * (0.35 + r * 0.12)) % 240);
        const clips: React.ReactNode[] = [];
        for (let i = 0; i < 9; i++) {
          const w = 70 + random(`w${r}${i}`) * 170;
          clips.push(
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: w,
                height: 18,
                borderRadius: 999,
                background: i % 3 === 0 ? palette.ink : palette.soft,
                opacity: (1 - x / width) * 0.9,
              }}
            />,
          );
          x += w + 14 + random(`g${r}${i}`) * 40;
        }
        return <React.Fragment key={r}>{clips}</React.Fragment>;
      })}
    </AbsoluteFill>
  );
}

function Grain({ seed }: { seed: number }) {
  return (
    <AbsoluteFill style={{ opacity: 0.09, mixBlendMode: "overlay" }}>
      <svg width="100%" height="100%">
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}
