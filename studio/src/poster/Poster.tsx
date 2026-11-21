import React from "react";
import { AbsoluteFill } from "remotion";
import { loadFont as loadArchivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import type { Scene } from "../types";

// Feed posts as bold flat posters, drawn entirely in code (no painted images).
// One giant word or number per slide, flat colour blocks, and the account's mascot (Pip) as a flat character.

const black = loadArchivoBlack("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const archivo = loadArchivo("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;

export const POSTER = { blue: "#1F3BFF", light: "#EEF1FF", white: "#FFFFFF", navy: "#0A1145", sky: "#6FB2FF", scarf: "#0B1FA8", shade: "#D6DCFA" };
const W = 1080;
const H = 1350;
const X = 70; // side margin
const INNER = W - X * 2;

type Tone = { bg: string; ink: string; em: string; muted: string; card: string; cardInk: string; line: string };
const LIGHT: Tone = { bg: POSTER.light, ink: POSTER.navy, em: POSTER.blue, muted: "rgba(10,17,69,0.62)", card: POSTER.white, cardInk: POSTER.navy, line: POSTER.navy };
const BLUE: Tone = { bg: POSTER.blue, ink: POSTER.light, em: POSTER.navy, muted: "rgba(238,241,255,0.78)", card: POSTER.light, cardInk: POSTER.navy, line: POSTER.navy };

// ---------------------------------------------------------------- type fitting
const CAPS = 0.69; // average Archivo Black capital width in em (with the tight tracking below)
const BODY = 0.56;

// Archivo Black capitals, in em at -0.02em tracking (measured roughly): wide, narrow and everything else.
const WIDE = new Set(["M", "W", "%", "@", "&"]);
const NARROW = new Set(["I", "1", ".", ",", "'", ":", ";", "!", "|", "’", "J"]);
function wordWidth(w: string, size: number, k: number) {
  if (k !== CAPS) return w.length * size * k;
  let em = 0;
  for (const ch of w) em += WIDE.has(ch) ? 0.98 : NARROW.has(ch) ? 0.38 : /[0-9]/.test(ch) ? 0.74 : 0.76;
  return em * size;
}

function lineCount(text: string, size: number, width: number, k: number) {
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  const space = size * 0.28;
  for (const w of words) {
    const ww = wordWidth(w, size, k);
    if (cur === 0) cur = ww;
    else if (cur + space + ww <= width) cur += space + ww;
    else {
      lines++;
      cur = ww;
    }
    if (ww > width) lines += 99; // a single word wider than the box never fits at this size
  }
  return lines;
}

/** Biggest size (≤ max) at which `text` fits `width` in `maxLines` lines. */
export function fit(text: string, width: number, maxLines: number, max: number, min = 40, k = CAPS) {
  for (let s = max; s > min; s -= 2) if (lineCount(text, s, width, k) <= maxLines) return s;
  return min;
}

const plain = (t: string) => t.replace(/\*/g, "");

/** "*word*" → emphasis colour. */
function Rich({ text, em }: { text: string; em: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/g).map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <span key={i} style={{ color: em }}>
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

const upper: React.CSSProperties = { fontFamily: black, textTransform: "uppercase", letterSpacing: "-0.02em", lineHeight: 0.92 };

function Kicker({ text, tone, style }: { text: string; tone: Tone; style?: React.CSSProperties }) {
  if (!text.trim()) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, fontFamily: archivo, fontWeight: 800, fontSize: 28, letterSpacing: "0.14em", textTransform: "uppercase", color: tone.ink, ...style }}>
      <span style={{ width: 34, height: 8, background: tone.em === POSTER.navy ? POSTER.navy : POSTER.blue }} />
      {plain(text)}
    </div>
  );
}

function Headline({ text, tone, width = INNER, maxLines = 4, max = 120, style }: { text: string; tone: Tone; width?: number; maxLines?: number; max?: number; style?: React.CSSProperties }) {
  const size = fit(plain(text).toUpperCase(), width, maxLines, max);
  return (
    <div style={{ ...upper, fontSize: size, color: tone.ink, maxWidth: width, ...style }}>
      <Rich text={text} em={tone.em} />
    </div>
  );
}

function Body({ text, tone, size = 38, style }: { text: string; tone: Tone; size?: number; style?: React.CSSProperties }) {
  if (!text.trim()) return null;
  return <div style={{ fontFamily: archivo, fontWeight: 600, fontSize: size, lineHeight: 1.3, color: tone.ink, maxWidth: 900, ...style }}>{plain(text)}</div>;
}

// ---------------------------------------------------------------- Pip, flat
export type PosterPose = "idle" | "wave" | "point" | "cheer";
const ARMS: Record<PosterPose, { l: [number, number]; r: [number, number] }> = {
  idle: { l: [34, 372], r: [366, 372] },
  wave: { l: [34, 372], r: [392, 118] },
  point: { l: [34, 372], r: [446, 236] },
  cheer: { l: [6, 120], r: [394, 120] },
};

export function FlatPip({ size = 400, pose = "idle" }: { size?: number; pose?: PosterPose }) {
  const ink = POSTER.navy;
  const a = ARMS[pose];
  const arm = (from: [number, number], to: [number, number], key: string) => {
    const mx = (from[0] + to[0]) / 2 + (to[1] < from[1] ? (to[0] > from[0] ? 26 : -26) : 0);
    const my = (from[1] + to[1]) / 2;
    const d = `M${from[0]} ${from[1]} Q${mx} ${my} ${to[0]} ${to[1]}`;
    return (
      <g key={key}>
        <path d={d} stroke={ink} strokeWidth={42} strokeLinecap="round" fill="none" />
        <path d={d} stroke={POSTER.white} strokeWidth={22} strokeLinecap="round" fill="none" />
        <circle cx={to[0]} cy={to[1]} r={26} fill={POSTER.white} stroke={ink} strokeWidth={10} />
      </g>
    );
  };
  return (
    <svg width={size} height={size * 1.15} viewBox="-20 0 460 460" style={{ overflow: "visible" }}>
      {arm([86, 262], a.l, "l")}
      {arm([314, 262], a.r, "r")}
      <rect x={193} y={46} width={14} height={54} rx={7} fill={ink} />
      <circle cx={200} cy={42} r={18} fill={POSTER.sky} stroke={ink} strokeWidth={9} />
      <ellipse cx={200} cy={252} rx={150} ry={156} fill={POSTER.white} stroke={ink} strokeWidth={11} />
      <path d="M262 132 A150 156 0 0 1 340 330 A190 190 0 0 0 262 132 Z" fill={POSTER.shade} />
      <rect x={104} y={160} width={192} height={112} rx={54} fill={ink} />
      <circle cx={206} cy={216} r={29} fill={POSTER.sky} />
      <circle cx={195} cy={205} r={9} fill={POSTER.white} />
      <path d="M52 290 Q200 340 348 290 L338 340 Q200 386 62 340 Z" fill={POSTER.scarf} stroke={ink} strokeWidth={11} strokeLinejoin="round" />
      <path d="M262 344 C276 380 270 406 284 440 L322 430 C306 398 314 372 302 336 Z" fill={POSTER.scarf} stroke={ink} strokeWidth={11} strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- slides
type P = { scene: Scene; index: number; total: number; handle: string; mascot: boolean };

function Footer({ tone, handle, right }: { tone: Tone; handle: string; right: string }) {
  return (
    <div style={{ position: "absolute", left: X, right: X, bottom: 54, display: "flex", justifyContent: "space-between", fontFamily: archivo, fontWeight: 800, fontSize: 26, letterSpacing: "0.08em", textTransform: "uppercase", color: tone.ink }}>
      <span>@{handle}</span>
      <span>{right}</span>
    </div>
  );
}

function Cover({ scene, mascot, tone }: P & { tone: Tone }) {
  const big = plain(scene.number || "").trim();
  if (big) {
    // Split poster: the big graphic in a colour block, the hook underneath, Pip sitting on the seam.
    const bigSize = Math.min(460, fit(big.toUpperCase(), INNER, 1, 460, 120, 0.74));
    return (
      <AbsoluteFill style={{ background: LIGHT.bg }}>
        <div style={{ height: 600, background: POSTER.blue, display: "flex", alignItems: "center", padding: `0 ${X - 8}px`, overflow: "hidden" }}>
          <span style={{ ...upper, fontSize: bigSize, color: POSTER.light, letterSpacing: "-0.06em", lineHeight: 0.8, whiteSpace: "nowrap" }}>{big}</span>
        </div>
        <div style={{ position: "absolute", left: X, top: 660, right: X }}>
          <Kicker text={scene.kicker} tone={LIGHT} style={{ marginBottom: 26 }} />
          <Headline text={scene.headline} tone={LIGHT} width={mascot ? 600 : INNER} maxLines={mascot ? 5 : 4} max={mascot ? 104 : 130} />
        </div>
        {mascot && (
          <div style={{ position: "absolute", right: 34, top: 470 }}>
            <FlatPip size={360} pose="point" />
          </div>
        )}
      </AbsoluteFill>
    );
  }
  // Full-bleed poster: the hook is the graphic.
  return (
    <AbsoluteFill style={{ background: tone.bg }}>
      <div style={{ position: "absolute", left: X, right: X, top: 110 }}>
        <Kicker text={scene.kicker} tone={tone} style={{ marginBottom: 34 }} />
        <Headline text={scene.headline} tone={tone} maxLines={mascot ? 4 : 6} max={170} />
      </div>
      {mascot && (
        <div style={{ position: "absolute", right: 40, bottom: 120 }}>
          <FlatPip size={430} pose="wave" />
        </div>
      )}
    </AbsoluteFill>
  );
}

function Statement({ scene, index, tone }: P & { tone: Tone }) {
  return (
    <AbsoluteFill style={{ background: tone.bg }}>
      {/* the slide number as a ghost graphic */}
      <div style={{ ...upper, position: "absolute", right: -30, bottom: -90, fontSize: 640, color: tone.bg === POSTER.blue ? "rgba(255,255,255,0.08)" : "rgba(31,59,255,0.08)", letterSpacing: "-0.08em" }}>
        {String(index + 1).padStart(2, "0")}
      </div>
      <div style={{ position: "absolute", left: X, right: X, top: 110 }}>
        <Kicker text={scene.kicker} tone={tone} style={{ marginBottom: 34 }} />
        <Headline text={scene.headline} tone={tone} maxLines={5} max={140} />
      </div>
      <div style={{ position: "absolute", left: X, right: X, bottom: 150 }}>
        <div style={{ width: 120, height: 10, background: tone.em, marginBottom: 30 }} />
        <Body text={scene.subline} tone={tone} size={40} />
      </div>
    </AbsoluteFill>
  );
}

function ListSlide({ scene, tone, steps }: P & { tone: Tone; steps?: boolean }) {
  const items = scene.items.slice(0, 5);
  const n = items.length;
  const cardSize = n > 4 ? 40 : n > 3 ? 46 : 52;
  const tilt = [-1.1, 0.8, -0.6, 0.9, -0.7];
  return (
    <AbsoluteFill style={{ background: tone.bg }}>
      <div style={{ position: "absolute", left: X, right: X, top: 100, bottom: 130, display: "flex", flexDirection: "column" }}>
        <Kicker text={scene.kicker} tone={tone} style={{ marginBottom: 28 }} />
        <Headline text={scene.headline} tone={tone} maxLines={3} max={n > 3 ? 110 : 140} />
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: n > 4 ? 14 : 20 }}>
          {items.map((it, i) =>
            steps ? (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 30, borderTop: `8px solid ${tone.ink}`, paddingTop: 18 }}>
                <span style={{ ...upper, fontSize: n > 4 ? 76 : 96, color: tone.em, width: 120, lineHeight: 0.85 }}>{i + 1}</span>
                <span style={{ fontFamily: archivo, fontWeight: 700, fontSize: cardSize, lineHeight: 1.15, color: tone.ink }}>{plain(it)}</span>
              </div>
            ) : (
              <div
                key={i}
                style={{
                  background: tone.card,
                  border: `6px solid ${tone.line}`,
                  borderRadius: 18,
                  padding: n > 4 ? "18px 26px" : "24px 30px",
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  boxShadow: `10px 10px 0 ${tone.line}`,
                  transform: `rotate(${tilt[i]}deg)`,
                  marginRight: 10,
                }}
              >
                <span style={{ ...upper, fontSize: cardSize + 8, color: POSTER.blue, minWidth: 44 }}>{i + 1}</span>
                <span style={{ fontFamily: archivo, fontWeight: 800, fontSize: cardSize, lineHeight: 1.12, color: tone.cardInk }}>{plain(it)}</span>
              </div>
            ),
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Stat({ scene, tone }: P & { tone: Tone }) {
  const num = plain(scene.number || "").trim() || "—";
  const size = Math.min(560, fit(num.toUpperCase(), INNER, 1, 560, 140, 0.74));
  return (
    <AbsoluteFill style={{ background: tone.bg }}>
      <div style={{ position: "absolute", left: X, right: X, top: 100, bottom: 130, display: "flex", flexDirection: "column" }}>
        <Kicker text={scene.kicker} tone={tone} />
        <div style={{ ...upper, fontSize: size, color: tone.em === POSTER.navy ? POSTER.light : POSTER.blue, letterSpacing: "-0.07em", lineHeight: 0.8, marginTop: 50, whiteSpace: "nowrap" }}>{num}</div>
        <Headline text={scene.numberLabel || scene.headline} tone={tone} maxLines={3} max={92} style={{ marginTop: 40 }} />
        <Body text={scene.subline} tone={tone} style={{ marginTop: "auto" }} />
      </div>
    </AbsoluteFill>
  );
}

function Compare({ scene, tone }: P & { tone: Tone }) {
  const side = (s: { label: string; value: string }, filled: boolean) => {
    const v = plain(s.value);
    const vs = fit(v.toUpperCase(), 380, 5, 84, 36);
    return (
      <div style={{ flex: 1, background: filled ? POSTER.navy : POSTER.white, border: `6px solid ${POSTER.navy}`, borderRadius: 22, padding: "64px 30px 34px", display: "flex", flexDirection: "column", gap: 20, boxShadow: `10px 10px 0 ${POSTER.navy}` }}>
        <div style={{ fontFamily: archivo, fontWeight: 800, fontSize: 26, letterSpacing: "0.12em", textTransform: "uppercase", color: filled ? POSTER.sky : POSTER.blue }}>{plain(s.label)}</div>
        <div style={{ ...upper, fontSize: vs, color: filled ? POSTER.light : POSTER.navy }}>{v}</div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ background: tone.bg }}>
      <div style={{ position: "absolute", left: X, right: X, top: 100, bottom: 130, display: "flex", flexDirection: "column" }}>
        <Kicker text={scene.kicker} tone={tone} style={{ marginBottom: 28 }} />
        <Headline text={scene.headline} tone={tone} maxLines={3} max={100} />
        <div style={{ display: "flex", gap: 28, marginTop: 56, position: "relative", minHeight: 440 }}>
          {side(scene.left, false)}
          {side(scene.right, true)}
          <div style={{ position: "absolute", left: "50%", top: -40, transform: "translateX(-50%) rotate(-8deg)", width: 120, height: 120, borderRadius: 60, background: POSTER.blue, border: `6px solid ${POSTER.navy}`, display: "flex", alignItems: "center", justifyContent: "center", ...upper, fontSize: 46, color: POSTER.light }}>
            VS
          </div>
        </div>
        <Body text={scene.subline} tone={tone} size={34} style={{ marginTop: "auto" }} />
      </div>
    </AbsoluteFill>
  );
}

function Verdict({ scene, tone }: P & { tone: Tone }) {
  const max = Math.max(1, Math.min(10, scene.scoreMax || 5));
  const score = Math.max(0, Math.min(max, Math.round(scene.score || 0)));
  const big = tone.em === POSTER.navy ? POSTER.light : POSTER.blue;
  return (
    <AbsoluteFill style={{ background: tone.bg }}>
      <div style={{ position: "absolute", left: X, right: X, top: 100, bottom: 130, display: "flex", flexDirection: "column" }}>
        <Kicker text={scene.kicker} tone={tone} style={{ marginBottom: 28 }} />
        <Headline text={scene.headline} tone={tone} maxLines={2} max={96} />
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 30 }}>
          <span style={{ ...upper, fontSize: 560, color: big, letterSpacing: "-0.08em", lineHeight: 0.78 }}>{score}</span>
          <span style={{ ...upper, fontSize: 180, color: tone.ink, marginLeft: 10, marginBottom: 6 }}>/{max}</span>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 44 }}>
          {Array.from({ length: max }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 58, borderRadius: 12, border: `6px solid ${tone.line === POSTER.navy && tone.bg === POSTER.blue ? POSTER.navy : POSTER.navy}`, background: i < score ? big : "transparent" }} />
          ))}
        </div>
        <Body text={scene.subline} tone={tone} size={34} style={{ marginTop: "auto" }} />
      </div>
    </AbsoluteFill>
  );
}

function Cta({ scene, mascot }: P) {
  const tone = BLUE;
  return (
    <AbsoluteFill style={{ background: tone.bg }}>
      <div style={{ position: "absolute", left: X, right: X, top: 110 }}>
        <Headline text={scene.headline} tone={tone} maxLines={5} max={150} width={INNER} />
        <Body text={scene.subline} tone={tone} size={36} style={{ marginTop: 40, maxWidth: mascot ? 560 : 900 }} />
      </div>
      {mascot && (
        <div style={{ position: "absolute", right: 30, bottom: 150 }}>
          <FlatPip size={380} pose="cheer" />
        </div>
      )}
      <div style={{ position: "absolute", left: X, bottom: 130, display: "flex", gap: 40, ...upper, fontSize: 44, color: POSTER.navy }}>
        <span>Save</span>
        <span style={{ color: POSTER.light }}>·</span>
        <span>Send</span>
      </div>
    </AbsoluteFill>
  );
}

export function PosterSlide(p: P) {
  const { scene, index, total, handle } = p;
  const cover = index === 0 && (scene.type === "hook" || scene.type === "illustration" || total > 1);
  // Alternate the ground so a carousel has rhythm when swiped; the cover and the CTA have fixed grounds.
  const tone = index % 2 === 1 ? BLUE : LIGHT;
  let body: React.ReactNode;
  let footTone = tone;
  if (cover || scene.type === "hook" || scene.type === "illustration") {
    const coverTone = BLUE;
    body = <Cover {...p} tone={coverTone} />;
    footTone = plain(scene.number || "").trim() ? LIGHT : coverTone;
  } else if (scene.type === "cta") {
    body = <Cta {...p} />;
    footTone = BLUE;
  } else if (scene.type === "list") body = <ListSlide {...p} tone={tone} />;
  else if (scene.type === "steps") body = <ListSlide {...p} tone={tone} steps />;
  else if (scene.type === "stat") body = <Stat {...p} tone={tone} />;
  else if (scene.type === "compare") body = <Compare {...p} tone={tone} />;
  else if (scene.type === "verdict") body = <Verdict {...p} tone={tone} />;
  else body = <Statement {...p} tone={tone} />;
  const right = total <= 1 ? "" : index === 0 ? "Swipe" : `${index + 1}/${total}`;
  return (
    <AbsoluteFill style={{ width: W, height: H, overflow: "hidden" }}>
      {body}
      <Footer tone={footTone} handle={handle} right={right} />
    </AbsoluteFill>
  );
}
