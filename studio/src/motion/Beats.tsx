import React from "react";
import { AbsoluteFill, Img, random, useCurrentFrame } from "remotion";
import { body, display, withAlpha } from "../brand";
import type { Beat, BeatItem, Scene } from "../types";
import { Icon } from "./Icon";
import { Mascot, type MascotColors } from "./Mascot";
import { mix, pr, type Theme } from "./theme";

// The motion vocabulary. Every visual keeps moving while it holds; entrances use expo-out, no overshoot.

export type BeatProps = { beat: Beat; scene: Scene; d: number; theme: Theme; mascot: MascotColors; seed: number };

/** The stage: the part of the 9:16 frame above the captions and clear of the app UI. */
export const STAGE = { top: 270, bottom: 610, side: 90 };

function Stage({ children, gap = 46 }: { children: React.ReactNode; gap?: number }) {
  return (
    <AbsoluteFill
      style={{
        padding: `${STAGE.top}px ${STAGE.side}px ${STAGE.bottom}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

type Tok = { word: string; em: boolean };
export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  let em = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let w = raw;
    if (w.startsWith("*")) {
      em = true;
      w = w.slice(1);
    }
    const closes = /\*[.,!?:;'"]*$/.test(w);
    w = w.replace(/\*/g, "");
    out.push({ word: w, em });
    if (closes) em = false;
  }
  return out;
}
const plain = (t: string) => t.replace(/\*/g, "");

/** Words rising out of a mask, one after another. */
function Words({ text, start = 0, size, theme, weight = 800, stagger = 2.5, color, align = "center" }: { text: string; start?: number; size: number; theme: Theme; weight?: number; stagger?: number; color?: string; align?: "center" | "left" }) {
  const f = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: "0.24em", fontFamily: display, fontWeight: weight, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.02em", textAlign: align, color: color ?? theme.ink }}>
      {tokenize(text).map((t, i) => {
        const p = pr(f, start + i * stagger, 14);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", padding: "0.06em 0.04em", margin: "-0.06em -0.04em" }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%) rotate(${(1 - p) * 5}deg)`, color: t.em ? theme.warm : undefined }}>{t.word}</span>
          </span>
        );
      })}
    </div>
  );
}

function Label({ text, start, theme, size = 30 }: { text: string; start: number; theme: Theme; size?: number }) {
  const f = useCurrentFrame();
  const p = pr(f, start, 14);
  if (!text) return null;
  return (
    <div style={{ fontFamily: body, fontWeight: 600, fontSize: size, letterSpacing: `${0.12 + p * 0.1}em`, textTransform: "uppercase", color: theme.accent, opacity: p }}>
      {plain(text)}
    </div>
  );
}

const titleSize = (text: string) => {
  const n = plain(text).length;
  return n <= 10 ? 184 : n <= 24 ? 142 : n <= 38 ? 114 : n <= 56 ? 92 : 76;
};

// ---------------------------------------------------------------------------

function Title({ beat, d, theme }: BeatProps) {
  const f = useCurrentFrame();
  const text = beat.text || beat.say;
  const toks = tokenize(text);
  const echo = (toks.find((t) => t.em) ?? toks.reduce((a, b) => (b.word.length > a.word.length ? b : a), toks[0] ?? { word: "", em: false })).word.toUpperCase().replace(/[^A-Z0-9$%]/g, "");
  const push = 1 + (f / Math.max(1, d)) * 0.05;
  const rule = pr(f, 6 + toks.length * 2.5, 18);
  return (
    <>
      {/* a huge outlined echo of the key word, sliding behind for depth */}
      <AbsoluteFill style={{ justifyContent: "center", transform: `scale(${1.1 + (f / Math.max(1, d)) * 0.06})`, filter: "blur(1.5px)" }}>
        <div
          style={{
            whiteSpace: "nowrap",
            fontFamily: display,
            fontWeight: 800,
            fontSize: 400,
            letterSpacing: "-0.04em",
            color: "transparent",
            WebkitTextStroke: `3px ${withAlpha(theme.accent, 0.2)}`,
            transform: `translate(${120 - f * 5}px, -40px)`,
            opacity: pr(f, 0, 16),
          }}
        >
          {echo} {echo} {echo}
        </div>
      </AbsoluteFill>
      <Stage gap={36}>
        <div style={{ transform: `scale(${push})` }}>
          <Words text={text} start={2} size={titleSize(text)} theme={theme} />
        </div>
        <div style={{ width: 240, height: 6, borderRadius: 3, background: theme.warm, transform: `scaleX(${rule})`, opacity: 0.9 }} />
      </Stage>
    </>
  );
}

function Halo({ size, theme, f, draw = 1 }: { size: number; theme: Theme; f: number; draw?: number }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <circle cx={r} cy={r} r={r * 0.84} fill="none" stroke={withAlpha(theme.accent, 0.55)} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} transform={`rotate(-90 ${r} ${r})`} />
      <g transform={`rotate(${f * 0.7} ${r} ${r})`} opacity={draw}>
        <circle cx={r} cy={r} r={r * 0.97} fill="none" stroke={withAlpha(theme.accent, 0.35)} strokeWidth={2} strokeDasharray="3 16" />
        {[0, 1, 2].map((i) => {
          const a = (i * 2 * Math.PI) / 3;
          return <circle key={i} cx={r + Math.cos(a) * r * 0.97} cy={r + Math.sin(a) * r * 0.97} r={i === 0 ? 9 : 6} fill={i === 0 ? theme.warm : theme.accent} />;
        })}
      </g>
    </svg>
  );
}

function IconBeat({ beat, theme }: BeatProps) {
  const f = useCurrentFrame();
  const draw = beat.transition === "cut" ? 0.35 + 0.65 * pr(f, 0, 12) : pr(f, 0, 14);
  const ring = pr(f, 0, 18);
  const S = 560;
  return (
    <Stage gap={30}>
      <div style={{ position: "relative", width: S, height: S, display: "grid", placeItems: "center" }}>
        <div style={{ position: "absolute", inset: -60, borderRadius: "50%", background: `radial-gradient(circle, ${withAlpha(theme.accent, 0.32)} 0%, ${withAlpha(theme.accent, 0)} 62%)`, transform: `scale(${0.7 + ring * 0.3 + Math.sin(f / 16) * 0.03})` }} />
        <Halo size={S} theme={theme} f={f} draw={ring} />
        <div style={{ transform: `translateY(${Math.sin(f / 13) * 10}px) rotate(${Math.sin(f / 21) * 4}deg) scale(${0.82 + draw * 0.18})` }}>
          <Icon name={beat.icon} size={290} color={theme.ink} draw={draw} strokeWidth={1.5} />
        </div>
      </div>
      {beat.text && <Words text={beat.text} start={10} size={plain(beat.text).length > 18 ? 70 : 88} theme={theme} />}
    </Stage>
  );
}

function Icons({ beat, theme, d }: BeatProps) {
  const f = useCurrentFrame();
  const items = beat.items.slice(0, 6);
  const n = items.length;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const size = n <= 2 ? 260 : n <= 4 ? 220 : 180;
  const st = Math.min(6, Math.max(3, (d - 20) / Math.max(1, n)));
  return (
    <Stage gap={60}>
      {beat.text && <Words text={beat.text} start={0} size={76} theme={theme} />}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${size + 40}px)`, columnGap: 34, rowGap: 52, justifyContent: "center" }}>
        {items.map((it, i) => {
          const s = 6 + i * st;
          const p = pr(f, s, 16);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, opacity: p, transform: `translateY(${(1 - p) * 60 + Math.sin(f / 14 + i) * 6}px)` }}>
              <div style={{ width: size, height: size, borderRadius: "50%", display: "grid", placeItems: "center", background: `radial-gradient(circle at 35% 30%, ${withAlpha(theme.ink, 0.16)}, ${withAlpha(theme.ink, 0.04)} 70%)`, border: `2px solid ${withAlpha(theme.accent, 0.45)}`, boxShadow: `0 24px 60px ${withAlpha("#000000", 0.35)}` }}>
                {it.icon ? (
                  <Icon name={it.icon} size={size * 0.5} color={i === 0 ? theme.warm : theme.ink} draw={pr(f, s + 3, 18)} />
                ) : (
                  <div style={{ fontFamily: display, fontWeight: 800, fontSize: size * (it.label.length > 5 ? 0.2 : 0.28), color: i % 2 ? theme.warm : theme.ink }}>{it.label}</div>
                )}
              </div>
              {it.icon && <div style={{ fontFamily: display, fontWeight: 800, fontSize: n > 4 ? 40 : 48, color: theme.ink, textAlign: "center", lineHeight: 1.1 }}>{it.label}</div>}
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function Split({ beat, theme, seed }: BeatProps) {
  const f = useCurrentFrame();
  const raw = beat.text || beat.say;
  const chunks = (raw.includes("|") ? raw.split("|") : raw.split(/\s+/)).map((s) => plain(s).trim()).filter(Boolean).slice(0, 10);
  const n = chunks.length;
  const chars = chunks.join("").length;
  const size = chars <= 12 ? 150 : chars <= 20 ? 118 : chars <= 32 ? 92 : 72;
  const appear = pr(f, 0, 12);
  const cutAt = (i: number) => 8 + i * 3;
  const sep = pr(f, 12 + n * 3, 18);
  const chipColors = [theme.accent, theme.warm, "#FFFFFF", mix(theme.accent, theme.field, 0.45)];
  return (
    <Stage>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: size * 0.16 + sep * 18, rowGap: 24 + sep * 20, opacity: appear, transform: `scale(${0.94 + appear * 0.06})` }}>
        {chunks.map((c, i) => {
          const r = (k: string) => random(`${seed}-${i}-${k}`) - 0.5;
          const bg = chipColors[i % chipColors.length];
          const cut = pr(f, cutAt(i), 7);
          return (
            <div
              key={i}
              style={{
                position: "relative",
                fontFamily: display,
                fontWeight: 800,
                fontSize: size,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                padding: `${0.16 * sep}em ${0.3 * sep}em`,
                borderRadius: 22 * sep,
                background: withAlpha(bg, 0.96 * sep),
                color: mix(theme.ink, theme.base, sep),
                boxShadow: `0 ${30 * sep}px ${60 * sep}px ${withAlpha("#000000", 0.35 * sep)}`,
                transform: `translateY(${(r("y") * 50 + Math.sin(f / 11 + i * 1.7) * 8) * sep}px) rotate(${r("r") * 9 * sep}deg)`,
              }}
            >
              {c}
              {i < n - 1 && (
                <div
                  style={{
                    position: "absolute",
                    right: -5,
                    top: "-22%",
                    height: "144%",
                    width: 5,
                    borderRadius: 3,
                    background: theme.warm,
                    boxShadow: `0 0 18px ${theme.warm}`,
                    transformOrigin: "top",
                    transform: `scaleY(${cut})`,
                    opacity: 1 - sep,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function parseNumber(s: string) {
  const m = s.match(/^([^\d]*)([\d.,]+)(.*)$/);
  if (!m) return null;
  const v = parseFloat(m[2].replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  return { pre: m[1], v, post: m[3], dec: m[2].includes(".") ? m[2].split(".")[1].length : 0, commas: m[2].includes(",") };
}

function Counter({ beat, theme, d }: BeatProps) {
  const f = useCurrentFrame();
  const num = parseNumber(beat.number);
  const k = pr(f, 4, Math.max(24, d * 0.7));
  const shown = num ? `${num.pre}${(num.v * k).toLocaleString("en-US", { minimumFractionDigits: num.dec, maximumFractionDigits: num.dec, useGrouping: num.commas || num.v >= 10000 })}${num.post}` : beat.number;
  const level = beat.level > 0 ? Math.min(1, beat.level) : 1;
  const arc = k * level;
  const S = 720;
  const r = S / 2;
  const L = beat.number.length;
  const fs = L <= 3 ? 230 : L <= 5 ? 175 : L <= 7 ? 128 : 100;
  return (
    <Stage gap={26}>
      <div style={{ position: "relative", width: S, height: S, display: "grid", placeItems: "center" }}>
        <svg width={S} height={S} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <circle cx={r} cy={r} r={r * 0.82} fill="none" stroke={withAlpha(theme.ink, 0.1)} strokeWidth={16} />
          <circle cx={r} cy={r} r={r * 0.82} fill="none" stroke={theme.warm} strokeWidth={16} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arc} transform={`rotate(-90 ${r} ${r})`} style={{ filter: `drop-shadow(0 0 14px ${withAlpha(theme.warm, 0.6)})` }} />
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
            const lit = i / 72 < arc;
            return <line key={i} x1={r + Math.cos(a) * r * 0.93} y1={r + Math.sin(a) * r * 0.93} x2={r + Math.cos(a) * r * (i % 6 ? 0.97 : 1.0)} y2={r + Math.sin(a) * r * (i % 6 ? 0.97 : 1.0)} stroke={lit ? theme.accent : withAlpha(theme.ink, 0.18)} strokeWidth={i % 6 ? 2 : 4} strokeLinecap="round" />;
          })}
        </svg>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: fs, letterSpacing: "-0.04em", color: theme.ink, fontVariantNumeric: "tabular-nums", opacity: pr(f, 0, 10), transform: `scale(${0.9 + pr(f, 0, 16) * 0.1})` }}>{shown}</div>
      </div>
      {beat.text && <Words text={beat.text} start={12} size={plain(beat.text).length > 22 ? 56 : 68} theme={theme} />}
    </Stage>
  );
}

function Bars({ beat, theme, d }: BeatProps) {
  const f = useCurrentFrame();
  const items = beat.items.slice(0, 4);
  const vals = items.map((it) => parseNumber(it.value)?.v ?? 0);
  const max = Math.max(1, ...vals);
  const top = vals.indexOf(Math.max(...vals));
  const st = Math.min(6, (d - 24) / Math.max(1, items.length));
  return (
    <Stage gap={56}>
      {beat.text && <Words text={beat.text} size={74} theme={theme} />}
      <div style={{ width: 880, display: "flex", flexDirection: "column", gap: 50 }}>
        {items.map((it, i) => {
          const s = 6 + i * st;
          const p = pr(f, s, 26);
          const num = parseNumber(it.value);
          const shown = num ? `${num.pre}${Math.round(num.v * p).toLocaleString("en-US")}${num.post}` : it.value;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 14, opacity: pr(f, s, 10) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: display, fontWeight: 800, fontSize: 56, color: theme.ink }}>
                <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {it.icon && <Icon name={it.icon} size={58} color={theme.accent} draw={pr(f, s, 16)} strokeWidth={2} />}
                  {it.label}
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: i === top ? theme.warm : theme.accent }}>{shown}</span>
              </div>
              <div style={{ height: 76, borderRadius: 20, background: withAlpha(theme.ink, 0.09), overflow: "hidden" }}>
                <div style={{ width: `${(vals[i] / max) * 100 * p}%`, height: "100%", borderRadius: 20, background: i === top ? `linear-gradient(90deg, ${mix(theme.warm, theme.base, 0.2)}, ${theme.warm})` : `linear-gradient(90deg, ${mix(theme.accent, theme.field, 0.5)}, ${theme.accent})` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function Versus({ beat, theme }: BeatProps) {
  const f = useCurrentFrame();
  const sides = [beat.items[0] ?? { icon: "", label: "", value: "" }, beat.items[1] ?? { icon: "", label: "", value: "" }];
  const line = pr(f, 8, 20);
  const card = (it: BeatItem, i: number) => {
    const p = pr(f, 2 + i * 5, 20);
    const dir = i === 0 ? 1 : -1;
    return (
      <div
        key={i}
        style={{
          width: 400,
          minHeight: 600,
          borderRadius: 40,
          padding: "48px 30px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          background: i === 1 ? `linear-gradient(160deg, ${withAlpha(theme.warm, 0.22)}, ${withAlpha(theme.warm, 0.05)})` : `linear-gradient(160deg, ${withAlpha(theme.ink, 0.13)}, ${withAlpha(theme.ink, 0.03)})`,
          border: `2px solid ${withAlpha(i === 1 ? theme.warm : theme.accent, 0.45)}`,
          boxShadow: `0 40px 90px ${withAlpha("#000000", 0.4)}`,
          opacity: p,
          transform: `perspective(1200px) translateX(${(1 - p) * -260 * dir}px) rotateY(${(1 - p) * 60 * dir + Math.sin(f / 20 + i * 2) * 3}deg) translateY(${Math.sin(f / 15 + i * 2) * 8}px)`,
        }}
      >
        <Icon name={it.icon || (i === 0 ? "circle-x" : "circle-check")} size={170} color={i === 1 ? theme.warm : theme.ink} draw={pr(f, 8 + i * 5, 18)} />
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 34, letterSpacing: "0.16em", textTransform: "uppercase", color: theme.accent, textAlign: "center" }}>{it.label}</div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: it.value.length > 14 ? 52 : 68, lineHeight: 1.05, color: theme.ink, textAlign: "center" }}>{it.value}</div>
      </div>
    );
  };
  return (
    <Stage gap={50}>
      {beat.text && <Words text={beat.text} size={74} theme={theme} />}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {card(sides[0], 0)}
        <div style={{ width: 80, alignSelf: "stretch", display: "grid", placeItems: "center", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, width: 3, background: withAlpha(theme.ink, 0.35), transform: `scaleY(${line})` }} />
          <div style={{ position: "relative", fontFamily: display, fontWeight: 800, fontSize: 34, color: theme.base, background: theme.ink, borderRadius: "50%", width: 74, height: 74, display: "grid", placeItems: "center", opacity: line, transform: `scale(${0.6 + line * 0.4})` }}>VS</div>
        </div>
        {card(sides[1], 1)}
      </div>
    </Stage>
  );
}

function Flow({ beat, theme, d }: BeatProps) {
  const f = useCurrentFrame();
  const items = beat.items.slice(0, 4);
  const n = items.length;
  const gap = n <= 2 ? 200 : n === 3 ? 110 : 64;
  const node = 190;
  const st = Math.min(10, (d - 20) / Math.max(1, n));
  return (
    <Stage gap={50}>
      {beat.text && <Words text={beat.text} size={70} theme={theme} />}
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {items.map((it, i) => {
          const s = 2 + i * st;
          const p = pr(f, s, 16);
          const conn = pr(f, s + 6, st + 4);
          const packet = ((f - s - 10) / 22) % 1;
          return (
            <div key={i} style={{ position: "relative", display: "flex", alignItems: "center", gap: 40, opacity: p, transform: `translateX(${(1 - p) * -80}px)` }}>
              {i < n - 1 && (
                <div style={{ position: "absolute", left: node / 2 - 2, top: node, width: 4, height: gap, background: withAlpha(theme.accent, 0.5), transformOrigin: "top", transform: `scaleY(${conn})` }}>
                  {conn >= 1 && packet >= 0 && <div style={{ position: "absolute", left: -8, top: packet * gap - 10, width: 20, height: 20, borderRadius: "50%", background: theme.warm, boxShadow: `0 0 22px 6px ${withAlpha(theme.warm, 0.6)}` }} />}
                </div>
              )}
              <div style={{ width: node, height: node, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", background: i === n - 1 ? theme.warm : withAlpha(theme.ink, 0.1), border: `2px solid ${withAlpha(theme.accent, 0.5)}`, boxShadow: `0 20px 50px ${withAlpha("#000000", 0.35)}` }}>
                <Icon name={it.icon || it.label} size={100} color={i === n - 1 ? theme.base : theme.ink} draw={pr(f, s + 2, 16)} strokeWidth={1.8} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
                <div style={{ fontFamily: display, fontWeight: 800, fontSize: 66, lineHeight: 1.05, color: theme.ink }}>{it.label}</div>
                {it.value && <div style={{ fontFamily: body, fontWeight: 500, fontSize: 40, color: withAlpha(theme.ink, 0.72) }}>{it.value}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function Meter({ beat, theme, seed, d }: BeatProps) {
  const f = useCurrentFrame();
  const level = beat.level > 0 ? Math.min(1, beat.level) : 0.85;
  const W = 380;
  const H = 780;
  const rows = 14;
  const rowH = (H - 36) / rows;
  const filled = Math.round(level * rows);
  const per = Math.min(2.6, Math.max(1.2, (d * 0.6) / Math.max(1, filled)));
  const reached = pr(f, 6 + filled * per, 10);
  const colors = [theme.accent, theme.warm, "#FFFFFF", mix(theme.accent, theme.field, 0.4)];
  const lineY = H - 18 - filled * rowH;
  return (
    <Stage gap={40}>
      <div style={{ position: "relative", width: W, height: H }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 44, border: `4px solid ${withAlpha(theme.ink, 0.35)}`, background: withAlpha(theme.ink, 0.04), overflow: "hidden" }}>
          {Array.from({ length: filled }, (_, r) => {
            const p = pr(f, 4 + r * per, 12);
            let x = 14;
            const w1 = 0.25 + random(`${seed}m${r}a`) * 0.3;
            const w2 = 0.2 + random(`${seed}m${r}b`) * 0.3;
            const widths = [w1, w2, 1 - w1 - w2].map((w) => w * (W - 8 - 28 - 16));
            return widths.map((w, c) => {
              const el = (
                <div
                  key={`${r}-${c}`}
                  style={{
                    position: "absolute",
                    left: x,
                    bottom: 14 + r * rowH,
                    width: w,
                    height: rowH - 8,
                    borderRadius: 10,
                    background: colors[(r + c) % colors.length],
                    opacity: p,
                    transform: `translateY(${(1 - p) * -(H + 100)}px)`,
                  }}
                />
              );
              x += w + 8;
              return el;
            });
          })}
        </div>
        {/* the limit line */}
        <div style={{ position: "absolute", left: -50, width: W + 100, top: lineY - 2, height: 0, borderTop: `4px dashed ${reached > 0 ? mix(theme.accent, theme.warm, reached) : theme.accent}`, opacity: pr(f, 2, 12) }} />
        {beat.text && (
          <div style={{ position: "absolute", left: -300, right: -300, top: lineY - 96, textAlign: "center", whiteSpace: "nowrap", fontFamily: display, fontWeight: 800, fontSize: 56, letterSpacing: "0.08em", textTransform: "uppercase", color: mix(theme.ink, theme.warm, reached), opacity: pr(f, 4, 14), transform: `translateY(${(1 - pr(f, 4, 14)) * 30}px)`, textShadow: `0 4px 24px ${withAlpha(theme.base, 0.8)}` }}>
            {plain(beat.text)}
          </div>
        )}
      </div>
    </Stage>
  );
}

function Character({ beat, theme, mascot, seed }: BeatProps) {
  const f = useCurrentFrame();
  const p = pr(f, 0, 18);
  const prop = beat.icon;
  const hold = beat.pose === "hold";
  const bubble = pr(f, 9, 14);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 540 - 280, top: 600, transform: `translateY(${(1 - p) * 520}px)` }}>
        <Mascot pose={beat.pose} size={560} colors={mascot} seed={seed} enter={4} />
        {prop && (
          <div
            style={{
              position: "absolute",
              left: hold ? 280 - 90 : 470,
              top: hold ? 380 : 40,
              width: 180,
              height: 180,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: `radial-gradient(circle, ${withAlpha(theme.warm, 0.4)} 0%, ${withAlpha(theme.warm, 0)} 68%)`,
              transform: `translateY(${Math.sin(f / 12) * (hold ? 4 : 12)}px) scale(${pr(f, 8, 14)})`,
            }}
          >
            <Icon name={prop} size={120} color={theme.ink} draw={pr(f, 10, 18)} strokeWidth={1.8} />
          </div>
        )}
      </div>
      {beat.text && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 330, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              position: "relative",
              maxWidth: 820,
              padding: "30px 44px",
              borderRadius: 40,
              background: theme.ink,
              color: theme.base,
              fontFamily: display,
              fontWeight: 800,
              fontSize: plain(beat.text).length > 26 ? 52 : 64,
              lineHeight: 1.08,
              textAlign: "center",
              boxShadow: `0 30px 70px ${withAlpha("#000000", 0.4)}`,
              opacity: bubble,
              transform: `translateY(${(1 - bubble) * 30 + Math.sin(f / 17) * 5}px) scale(${0.92 + bubble * 0.08})`,
              transformOrigin: "50% 100%",
            }}
          >
            {tokenize(beat.text).map((t, i) => (
              <span key={i} style={{ color: t.em ? theme.field : undefined }}>
                {t.word}{" "}
              </span>
            ))}
            <div style={{ position: "absolute", left: "50%", bottom: -22, width: 44, height: 44, background: theme.ink, transform: "translateX(-50%) rotate(45deg)", borderRadius: 6 }} />
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}

function Chat({ beat, theme, d }: BeatProps) {
  const f = useCurrentFrame();
  const items = beat.items.slice(0, 4);
  const st = Math.max(8, Math.min(22, (d - 10) / Math.max(1, items.length)));
  return (
    <Stage gap={30}>
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 34 }}>
        {items.map((it, i) => {
          const s = 2 + i * st;
          const p = pr(f, s, 12);
          const ai = /^(ai|bot|assistant|chatgpt|claude|gemini)/i.test(it.label);
          const typing = ai ? 8 : 0;
          const reveal = pr(f, s + typing, Math.max(8, st - typing));
          const text = plain(it.value);
          const shown = text.slice(0, Math.ceil(text.length * reveal));
          return (
            <div key={i} style={{ display: "flex", justifyContent: ai ? "flex-start" : "flex-end", alignItems: "flex-end", gap: 18, opacity: p, transform: `translateY(${(1 - p) * 40}px) scale(${0.96 + p * 0.04})`, transformOrigin: ai ? "0% 100%" : "100% 100%" }}>
              {ai && (
                <div style={{ width: 78, height: 78, flexShrink: 0, borderRadius: "50%", background: theme.ink, display: "grid", placeItems: "center" }}>
                  <Icon name="bot" size={46} color={theme.field} strokeWidth={2} />
                </div>
              )}
              <div
                style={{
                  maxWidth: 720,
                  padding: "30px 40px",
                  borderRadius: 36,
                  borderBottomLeftRadius: ai ? 10 : 36,
                  borderBottomRightRadius: ai ? 36 : 10,
                  background: ai ? withAlpha(theme.field, 0.85) : theme.ink,
                  border: ai ? `2px solid ${withAlpha(theme.accent, 0.5)}` : "none",
                  color: ai ? theme.ink : theme.base,
                  fontFamily: body,
                  fontWeight: 600,
                  fontSize: 50,
                  lineHeight: 1.22,
                  boxShadow: `0 24px 60px ${withAlpha("#000000", 0.35)}`,
                }}
              >
                {ai && f < s + typing ? (
                  <span style={{ display: "inline-flex", gap: 10, padding: "8px 0" }}>
                    {[0, 1, 2].map((k) => (
                      <span key={k} style={{ width: 14, height: 14, borderRadius: "50%", background: theme.ink, opacity: 0.35 + 0.65 * Math.abs(Math.sin((f - k * 3) / 4)) }} />
                    ))}
                  </span>
                ) : (
                  <>
                    {shown}
                    <span style={{ opacity: 0 }}>{text.slice(shown.length)}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function Checklist({ beat, theme, d }: BeatProps) {
  const f = useCurrentFrame();
  const items = beat.items.slice(0, 5);
  const st = Math.max(5, Math.min(12, (d - 16) / Math.max(1, items.length)));
  return (
    <Stage gap={54}>
      {beat.text && <Words text={beat.text} size={76} theme={theme} />}
      <div style={{ width: 880, display: "flex", flexDirection: "column", gap: 44 }}>
        {items.map((it, i) => {
          const s = 4 + i * st;
          const p = pr(f, s, 14);
          const chk = pr(f, s + 5, 12);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 32, opacity: p, transform: `translateX(${(1 - p) * 70}px)` }}>
              <svg width={100} height={100} viewBox="0 0 84 84" style={{ flexShrink: 0, overflow: "visible" }}>
                <circle cx={42} cy={42} r={38} fill={withAlpha(theme.warm, 0.95 * chk)} stroke={chk > 0 ? theme.warm : withAlpha(theme.accent, 0.7)} strokeWidth={4} />
                <path d="M25 43 L37 55 L60 30" fill="none" stroke={theme.base} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - chk} />
              </svg>
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 62, lineHeight: 1.08, color: theme.ink }}>{it.label}</div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function Painting({ beat, scene, theme, d }: BeatProps) {
  const f = useCurrentFrame();
  if (!scene.imageSrc) return <Title beat={beat} scene={scene} d={d} theme={theme} mascot={{ body: "", eye: "", scarf: "" }} seed={0} />;
  const p = pr(f, 0, 22);
  const k = f / Math.max(1, d);
  const sheen = pr(f, 8, 26);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 250 }}>
      <div
        style={{
          position: "relative",
          width: 860,
          height: 1020,
          borderRadius: 44,
          overflow: "hidden",
          boxShadow: `0 60px 140px ${withAlpha("#000000", 0.55)}, 0 0 0 2px ${withAlpha(theme.ink, 0.15)}`,
          opacity: p,
          transform: `perspective(1600px) translateY(${(1 - p) * 160}px) rotateX(${(1 - p) * 22 + Math.sin(f / 30) * 1.5}deg) rotateY(${Math.sin(f / 26) * 2.5}deg) scale(${0.9 + p * 0.1})`,
        }}
      >
        <Img src={scene.imageSrc} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.2 - k * 0.08}) translateY(${(k - 0.5) * -30}px)` }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(115deg, transparent ${sheen * 140 - 40}%, ${withAlpha("#FFFFFF", 0.22)} ${sheen * 140 - 25}%, transparent ${sheen * 140 - 10}%)` }} />
        {beat.text && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "160px 50px 50px", background: `linear-gradient(to bottom, transparent, ${withAlpha(theme.base, 0.85)})` }}>
            <Words text={beat.text} start={10} size={plain(beat.text).length > 22 ? 64 : 82} theme={theme} align="left" />
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

export function BeatVisual(props: BeatProps) {
  switch (props.beat.visual) {
    case "icon":
      return <IconBeat {...props} />;
    case "icons":
      return <Icons {...props} />;
    case "split":
      return <Split {...props} />;
    case "counter":
      return <Counter {...props} />;
    case "bars":
      return <Bars {...props} />;
    case "versus":
      return <Versus {...props} />;
    case "flow":
      return <Flow {...props} />;
    case "meter":
      return <Meter {...props} />;
    case "character":
      return <Character {...props} />;
    case "chat":
      return <Chat {...props} />;
    case "checklist":
      return <Checklist {...props} />;
    case "painting":
      return <Painting {...props} />;
    default:
      return <Title {...props} />;
  }
}
