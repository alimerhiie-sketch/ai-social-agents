import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, random, Sequence, useCurrentFrame } from "remotion";
import { display, withAlpha } from "../brand";
import type { ArtStyle } from "../artStyles";
import type { BeatTransition, ReelProps, Scene } from "../types";
import { BeatVisual } from "./Beats";
import { PIP } from "./Mascot";
import { inOut, pr, prIn, themeFor, type Theme } from "./theme";
import { AUDIO_DELAY, OUT, placeBeats, type PlacedBeat } from "./timing";
import { lookById, type Look } from "./looks";

const W = 1080;
const H = 1920;

/** Enter lengths per transition (frames). */
const ENTER: Record<BeatTransition, number> = { cut: 8, whip: 11, zoom: 12, wipe: 13, iris: 14 };
const SLANT = 300;

export function MotionReel({ scenes, palette, showCaptions, style, sceneFrames, mascot, look: lookId }: ReelProps & { style: ArtStyle | null; sceneFrames: (s: Scene) => number }) {
  const look = lookById(lookId);
  const theme = themeFor(palette, style, look);
  const placed = placeBeats(scenes, sceneFrames);
  const sceneStarts: number[] = [];
  let acc = 0;
  for (const s of scenes) {
    sceneStarts.push(acc);
    acc += sceneFrames(s);
  }

  return (
    <AbsoluteFill style={{ background: theme.base, overflow: "hidden" }}>
      <Camera placed={placed} depth>
        {look.id === "brand" ? <World theme={theme} scenes={scenes} sceneStarts={sceneStarts} sceneFrames={sceneFrames} /> : <LookWorld look={look} />}
      </Camera>
      {look.boil && <BoilDefs />}
      {/* beats ride the same camera on their own flat layer, so they never intersect the world's planes */}
      <Camera placed={placed} filter={look.boil ? "url(#boil)" : undefined}>
        {placed.map((p) => (
          <Sequence key={p.index} from={p.from} durationInFrames={p.d + (p.last ? 0 : OUT)} name={`${p.sceneIndex + 1}.${p.index + 1} ${p.beat.visual}`}>
            <BeatShell p={p} theme={theme}>
              <BeatVisual beat={p.beat} scene={p.scene} d={p.d} theme={theme} look={look} mascot={mascot ?? PIP} seed={p.index + 1} />
            </BeatShell>
          </Sequence>
        ))}
      </Camera>

      {showCaptions && placed.map((p) => (p.beat.visual === "title" || !p.words.length ? null : (
        <Sequence key={`c${p.index}`} from={p.from} durationInFrames={p.d} name={`captions ${p.index + 1}`}>
          <Caption p={p} theme={theme} />
        </Sequence>
      )))}

      {scenes.map((s, i) =>
        s.audioSrc ? (
          <Sequence key={`a${i}`} from={sceneStarts[i] + AUDIO_DELAY} name={`voice ${i + 1}`}>
            <Audio src={s.audioSrc} />
          </Sequence>
        ) : null,
      )}

      <Finish theme={theme} />
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// Camera: a slow drift through a 3D space, with a small push on every new beat.

function Camera({ placed, children, depth = false, filter }: { placed: PlacedBeat[]; children: React.ReactNode; depth?: boolean; filter?: string }) {
  const f = useCurrentFrame();
  const cur = [...placed].reverse().find((p) => f >= p.from);
  const since = cur ? f - cur.from : 99;
  const kick = cur && cur.index > 0 ? (1 - pr(since, 0, 16)) * 0.025 : 0;
  const rx = Math.cos(f / 97) * 2.2;
  const ry = Math.sin(f / 83) * 3.2;
  return (
    <AbsoluteFill style={{ perspective: 1400, perspectiveOrigin: "50% 42%", filter }}>
      <AbsoluteFill style={{ transformStyle: depth ? "preserve-3d" : "flat", transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${1 + kick})` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------
// World: layered depth behind every beat — painted plate far back, a dot plane, drifting light.

function World({ theme, scenes, sceneStarts, sceneFrames }: { theme: Theme; scenes: Scene[]; sceneStarts: number[]; sceneFrames: (s: Scene) => number }) {
  const f = useCurrentFrame();
  const glowX = 50 + Math.sin(f / 70) * 18;
  const glowY = 38 + Math.cos(f / 90) * 8;
  return (
    <>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 90% 60% at ${glowX}% ${glowY}%, ${theme.field} 0%, ${theme.deep} 38%, ${theme.base} 100%)`, transform: "translateZ(-900px) scale(1.7)" }} />

      {/* painted plates (the account's art style) far back, out of focus */}
      {scenes.map((s, i) => {
        if (!s.imageSrc) return null;
        const a = sceneStarts[i];
        const b = a + sceneFrames(s);
        const o = interpolate(f, [a - 1, a + 14, b - 1, b + 14], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (o <= 0) return null;
        const k = (f - a) / Math.max(1, b - a);
        return (
          <AbsoluteFill key={i} style={{ opacity: o * 0.55, transform: `translateZ(-800px) scale(${1.75 + k * 0.06})` }}>
            <Img src={s.imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(16px) saturate(1.1) brightness(0.75)" }} />
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, ${withAlpha(theme.base, 0.2)} 0%, ${withAlpha(theme.base, 0.55)} 100%)`, transform: "translateZ(-700px) scale(1.6)" }} />

      {/* dot plane receding to a horizon */}
      <div
        style={{
          position: "absolute",
          left: -1400,
          top: 1100,
          width: W + 2800,
          height: 2600,
          backgroundImage: `radial-gradient(circle, ${withAlpha(theme.accent, 0.5)} 2.2px, transparent 2.8px)`,
          backgroundSize: "64px 64px",
          backgroundPosition: `0px ${(f * 1.6) % 64}px`,
          transformOrigin: "50% 0%",
          transform: "translateZ(-300px) rotateX(76deg)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 30%, black 60%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 30%, black 60%, transparent 100%)",
          opacity: 0.45,
        }}
      />

      {/* soft lights at different depths: parallax under the camera */}
      {Array.from({ length: 9 }, (_, i) => {
        const r = (k: string) => random(`bk${i}${k}`);
        const z = -800 + r("z") * 700;
        const size = 90 + r("s") * 260;
        const x = r("x") * W + Math.sin(f / (60 + r("w") * 50) + i) * 50;
        const y = ((r("y") * (H + 400) - f * (0.4 + r("v") * 0.8)) % (H + 400) + H + 400) % (H + 400) - 200;
        const c = i % 2 ? theme.accent : theme.field;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${withAlpha(c, 0.32)} 0%, ${withAlpha(c, 0)} 70%)`,
              transform: `translateZ(${z}px)`,
            }}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Transitions: each beat enters its own way and leaves the way the next one enters.

function BeatShell({ p, theme, children }: { p: PlacedBeat; theme: Theme; children: React.ReactNode }) {
  const f = useCurrentFrame();
  const kind = p.beat.transition;
  const style: React.CSSProperties = {};
  const tf: string[] = [];
  let opacity = 1;
  let blur = 0;
  let stripe: number | null = null;

  // enter
  if (p.index > 0 || kind !== "cut") {
    const L = ENTER[kind] ?? 8;
    const t = pr(f, 0, L);
    switch (kind) {
      case "whip": {
        tf.push(`translateX(${(1 - t) * W * 1.05}px)`);
        blur += (1 - Math.abs(1 - 2 * t)) * 18;
        break;
      }
      case "zoom":
        tf.push(`scale(${0.55 + t * 0.45})`);
        opacity *= t;
        blur += (1 - t) * 14;
        break;
      case "wipe": {
        const e = inOut(Math.min(1, f / L)) * (W + SLANT + 40);
        if (f < L) {
          style.clipPath = `polygon(0px 0px, ${e}px 0px, ${e - SLANT}px ${H}px, 0px ${H}px)`;
          stripe = e;
        }
        break;
      }
      case "iris": {
        const r = inOut(Math.min(1, f / L)) * 125;
        if (f < L) style.clipPath = `circle(${r}% at 50% 44%)`;
        break;
      }
      default:
        tf.push(`scale(${1.06 - t * 0.06})`);
    }
  }

  // exit (shaped by how the next beat enters)
  if (!p.last && f >= p.d) {
    const g = f - p.d;
    const t = prIn(g, 0, OUT);
    switch (p.exit) {
      case "whip": {
        const w = pr(g, 0, ENTER.whip);
        tf.push(`translateX(${-w * W * 1.05}px)`);
        blur += (1 - Math.abs(1 - 2 * w)) * 18;
        opacity *= g >= ENTER.whip ? 0 : 1;
        break;
      }
      case "zoom":
        tf.push(`scale(${1 + t * 0.9})`);
        opacity *= 1 - t;
        blur += t * 12;
        break;
      case "wipe": {
        const e = inOut(Math.min(1, g / ENTER.wipe)) * (W + SLANT + 40);
        style.clipPath = `polygon(${e}px 0px, ${W + SLANT}px 0px, ${W + SLANT}px ${H}px, ${e - SLANT}px ${H}px)`;
        break;
      }
      case "iris":
        tf.push(`scale(${1 - t * 0.12})`);
        opacity *= 1 - t;
        break;
      default:
        opacity = 0;
    }
  }

  return (
    <>
      <AbsoluteFill style={{ ...style, opacity, transform: tf.join(" ") || undefined, filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>{children}</AbsoluteFill>
      {stripe !== null && (
        <div
          style={{
            position: "absolute",
            left: stripe - SLANT / 2 - 4,
            top: -200,
            width: 8,
            height: H + 400,
            background: theme.warm,
            boxShadow: `0 0 40px 10px ${withAlpha(theme.warm, 0.5)}`,
            transform: `rotate(${(Math.atan(SLANT / H) * 180) / Math.PI}deg)`,
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kinetic captions: each word arrives as it is spoken, in phrases of up to six words.

function Caption({ p, theme }: { p: PlacedBeat; theme: Theme }) {
  const f = useCurrentFrame();
  const groups: (typeof p.words)[] = [];
  let cur: typeof p.words = [];
  for (const w of p.words) {
    cur.push(w);
    if (cur.length >= 6 || /[.,!?;:]$/.test(w.text)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  const g = [...groups].reverse().find((gr) => f >= gr[0].at - 2) ?? groups[0];
  if (!g) return null;
  return (
    <AbsoluteFill style={{ top: 1350, height: 260, display: "flex", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignContent: "flex-start", columnGap: 18, rowGap: 4, padding: "0 120px" }}>
      {g.map((w, i) => {
        const t = pr(f, w.at - 2, 7);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontFamily: theme.light ? theme.bodyFont : theme.font,
              fontWeight: theme.light ? 700 : theme.weight,
              fontSize: theme.font === display ? 62 : theme.light ? 76 : 66,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              color: w.em ? theme.warm : theme.light ? "#1C1C1C" : "#FFFFFF",
              opacity: t,
              filter: t < 1 ? `blur(${(1 - t) * 8}px)` : undefined,
              transform: `translateY(${(1 - t) * 18}px)`,
              textShadow: outline(theme.light ? "#FFFFFF" : "#0A0A14", theme.light ? 5 : 4),
            }}
          >
            {w.text}
          </span>
        );
      })}
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------

function Finish({ theme }: { theme: Theme }) {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, transparent 55%, ${withAlpha(theme.base, 0.7)} 100%)` }} />
      <AbsoluteFill style={{ opacity: 0.06, mixBlendMode: "overlay" }}>
        <svg width="100%" height="100%">
          <filter id="mgrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={4} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#mgrain)" />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** A solid outline around caption words, so they read on any frame. */
function outline(c: string, w: number) {
  const out: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out.push(`${(Math.cos(a) * w).toFixed(1)}px ${(Math.sin(a) * w).toFixed(1)}px 0 ${c}`);
  }
  out.push(`0 6px 24px ${withAlpha("#000000", 0.35)}`);
  return out.join(", ");
}

/** Hand-drawn line boil: the displacement pattern changes 10 times a second. */
function BoilDefs() {
  const f = useCurrentFrame();
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <filter id="boil" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={Math.floor(f / 3) % 7} />
        <feDisplacementMap in="SourceGraphic" scale={5} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/** The ground behind non-scene beats, per look. */
function LookWorld({ look }: { look: Look }) {
  const f = useCurrentFrame();
  const back = "translateZ(-600px) scale(1.45)";
  if (look.light) {
    return (
      <>
        <AbsoluteFill style={{ background: look.paper, transform: back }} />
        <AbsoluteFill style={{ transform: back, mixBlendMode: "multiply", opacity: 0.35 }}>
          <svg width="100%" height="100%">
            <filter id="paperTex">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} seed={3} />
              <feColorMatrix type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0.5 0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#paperTex)" />
          </svg>
        </AbsoluteFill>
        {Array.from({ length: 7 }, (_, i) => {
          const r = (k: string) => random(`dd${i}${k}`);
          const x = r("x") * W;
          const y = (((r("y") * H - f * (0.3 + r("v") * 0.5)) % H) + H) % H;
          const kind = i % 3;
          return (
            <svg key={i} width={120} height={120} viewBox="-60 -60 120 120" style={{ position: "absolute", left: x - 60, top: y - 60, transform: `translateZ(${-300 - r("z") * 300}px) rotate(${f * (r("r") - 0.5)}deg)`, opacity: 0.18 }}>
              {kind === 0 && <path d="M0 -40 L10 -10 L40 0 L10 10 L0 40 L-10 10 L-40 0 L-10 -10 Z" fill="none" stroke={look.ink} strokeWidth={5} strokeLinejoin="round" />}
              {kind === 1 && <circle r={30} fill="none" stroke={look.accent} strokeWidth={6} />}
              {kind === 2 && <path d="M-40 10 Q-20 -20 0 10 T40 10" fill="none" stroke={look.accent2} strokeWidth={6} strokeLinecap="round" />}
            </svg>
          );
        })}
      </>
    );
  }
  if (look.id === "blueprint") {
    return (
      <>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, #1452B8 0%, ${look.bg} 55%, #082A66 100%)`, transform: back }} />
        <AbsoluteFill
          style={{
            transform: back,
            backgroundImage: `linear-gradient(${withAlpha(look.ink, 0.07)} 2px, transparent 2px), linear-gradient(90deg, ${withAlpha(look.ink, 0.07)} 2px, transparent 2px), linear-gradient(${withAlpha(look.ink, 0.15)} 2px, transparent 2px), linear-gradient(90deg, ${withAlpha(look.ink, 0.15)} 2px, transparent 2px)`,
            backgroundSize: "48px 48px, 48px 48px, 240px 240px, 240px 240px",
            backgroundPosition: `0 ${(f * 0.6) % 240}px`,
          }}
        />
      </>
    );
  }
  const stars = look.id === "cosmic" ? 70 : 30;
  return (
    <>
      <AbsoluteFill style={{ background: look.id === "cosmic" ? `radial-gradient(ellipse at 50% 30%, #4A2FA8 0%, ${look.bg} 60%, #0E0A26 100%)` : `linear-gradient(180deg, ${look.bg} 0%, #241B48 70%, #3A2350 100%)`, transform: back }} />
      <AbsoluteFill style={{ transform: back }}>
        {Array.from({ length: stars }, (_, i) => {
          const r = (k: string) => random(`ls${i}${k}`);
          const tw = 0.3 + 0.7 * Math.abs(Math.sin(f / (12 + r("t") * 20) + i));
          const size = 1.5 + r("s") * (look.id === "cosmic" ? 4 : 2.5);
          const drift = look.id === "lofi" ? -f * (0.2 + r("v") * 0.4) : 0;
          return <div key={i} style={{ position: "absolute", left: r("x") * W, top: (((r("y") * H + drift) % H) + H) % H, width: size, height: size, borderRadius: "50%", background: look.id === "lofi" && i % 3 === 0 ? look.warm : "#FFFFFF", opacity: tw * (look.id === "lofi" ? 0.5 : 0.9) }} />;
        })}
        <div style={{ position: "absolute", left: -200, bottom: -200, width: 900, height: 900, borderRadius: "50%", background: `radial-gradient(circle, ${withAlpha(look.id === "cosmic" ? look.accent2 : look.accent, 0.22)} 0%, transparent 65%)` }} />
        <div style={{ position: "absolute", right: -260, top: 200, width: 800, height: 800, borderRadius: "50%", background: `radial-gradient(circle, ${withAlpha(look.accent2, 0.18)} 0%, transparent 65%)` }} />
      </AbsoluteFill>
    </>
  );
}
