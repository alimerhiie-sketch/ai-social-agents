import React from "react";
import { AbsoluteFill, Img, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { body, display, easeOut, roman, serif, withAlpha } from "../brand";
import type { ArtStyle, CaptionFont, Particles as ParticleKind } from "../artStyles";
import type { Camera, Scene } from "../types";

/** Frames two illustrated scenes overlap while one transitions into the next. */
export const OVERLAP = 16;

export const fontFor = (f: CaptionFont) => (f === "roman" ? roman : f === "sans" ? body : f === "display" ? display : serif);

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // in-out, for camera moves

/** Slow camera over the still: the painting is never static. */
function cameraTransform(camera: Camera | undefined, p: number) {
  const k = ease(p);
  switch (camera) {
    case "pull-out":
      return `scale(${1.2 - 0.12 * k})`;
    case "pan-left":
      return `scale(1.16) translateX(${4 - 8 * k}%)`;
    case "pan-right":
      return `scale(1.16) translateX(${-4 + 8 * k}%)`;
    case "rise":
      return `scale(1.16) translateY(${4 - 7 * k}%)`;
    case "drift":
      return `scale(${1.1 + 0.05 * k}) translate(${-1.5 + 3 * k}%, ${1 - 2 * k}%) rotate(${-0.6 + 1.2 * k}deg)`;
    default: // push-in
      return `scale(${1.06 + 0.13 * k})`;
  }
}

/** One painted scene: image + camera + grade, entering with the style's transition. */
export function IllustrationLayer({ scene, style, length, enter }: { scene: Scene; style: ArtStyle; length: number; enter: boolean }) {
  const frame = useCurrentFrame();
  const p = frame / Math.max(1, length);
  const t = enter ? interpolate(frame, [0, OVERLAP], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill style={transitionStyle(style.transition, t, frame)}>
      {scene.imageSrc ? (
        <Img src={scene.imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover", transform: cameraTransform(scene.camera, p), filter: style.grade }} />
      ) : (
        <AbsoluteFill style={{ background: style.scrim }} />
      )}
    </AbsoluteFill>
  );
}

function transitionStyle(kind: ArtStyle["transition"], t: number, frame: number): React.CSSProperties {
  if (t >= 1) return {};
  switch (kind) {
    case "wash": {
      // a wet wash rising up the frame with a soft, uneven edge
      const edge = t * 135 - 20;
      const mask = `linear-gradient(to top, black ${edge - 18}%, rgba(0,0,0,0.55) ${edge}%, transparent ${edge + 14}%)`;
      return { WebkitMaskImage: mask, maskImage: mask, filter: `saturate(${0.8 + 0.2 * t})` };
    }
    case "ink": {
      // ink blooming outward from just below centre
      const r = t * 95;
      const wobble = Math.sin(frame * 0.9) * 3;
      const mask = `radial-gradient(ellipse ${r + wobble}% ${r * 0.8}% at 50% 58%, black 55%, transparent 100%)`;
      return { WebkitMaskImage: mask, maskImage: mask };
    }
    case "tear": {
      // paper sliding in from the right with a torn leading edge
      const x = (1 - t) * 104;
      const jag = Array.from({ length: 13 }, (_, i) => `${x + (i % 2 ? 2.4 : 0)}% ${(i / 12) * 100}%`).join(", ");
      return { clipPath: `polygon(${jag}, 100% 100%, 100% 0%)` };
    }
    case "bloom":
      return { opacity: t, filter: `brightness(${1 + (1 - t) * 0.35}) blur(${(1 - t) * 14}px)` };
    default:
      return { opacity: t, filter: `blur(${(1 - t) * 6}px)` };
  }
}

/** Texture, glow, particles and the caption scrim, on top of every illustrated frame. */
export function Atmosphere({ style, still = false }: { style: ArtStyle; still?: boolean }) {
  const frame = useCurrentFrame();
  const t = still ? 60 : frame;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {style.glow && (
        <AbsoluteFill
          style={{
            mixBlendMode: "screen",
            opacity: 0.32 + Math.sin(t / 40) * 0.05,
            background: `radial-gradient(circle at ${72 + Math.sin(t / 100) * 8}% ${22 + Math.cos(t / 120) * 5}%, ${withAlpha(style.glow, 0.6)} 0%, ${withAlpha(style.glow, 0)} 50%)`,
          }}
        />
      )}
      <Particles kind={style.particles} frame={t} />
      {style.texture !== "none" && <Texture kind={style.texture} />}
      {/* vignette + lower scrim for legible captions */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%, transparent 55%, ${withAlpha(style.scrim, 0.45)} 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(to bottom, transparent 52%, ${withAlpha(style.scrim, 0.7)} 88%, ${withAlpha(style.scrim, 0.82)} 100%)` }} />
    </AbsoluteFill>
  );
}

function Texture({ kind }: { kind: "paper" | "canvas" }) {
  return (
    <AbsoluteFill style={{ mixBlendMode: "multiply", opacity: kind === "paper" ? 0.22 : 0.3 }}>
      <svg width="100%" height="100%">
        <filter id={`tex-${kind}`}>
          <feTurbulence type={kind === "paper" ? "fractalNoise" : "turbulence"} baseFrequency={kind === "paper" ? "0.9" : "0.35 0.9"} numOctaves={kind === "paper" ? 3 : 2} seed={7} />
          <feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0.9 0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#tex-${kind})`} />
      </svg>
    </AbsoluteFill>
  );
}

function Particles({ kind, frame }: { kind: ParticleKind; frame: number }) {
  const { width, height } = useVideoConfig();
  if (kind === "none") return null;
  const n = kind === "fireflies" ? 26 : kind === "petals" ? 16 : kind === "ink" ? 10 : 38;
  return (
    <AbsoluteFill>
      {Array.from({ length: n }, (_, i) => {
        const r = (k: string) => random(`${kind}-${i}-${k}`);
        const speed = 0.25 + r("s") * 0.6;
        const size = kind === "petals" ? 14 + r("z") * 16 : kind === "fireflies" ? 5 + r("z") * 6 : kind === "ink" ? 6 + r("z") * 14 : 2 + r("z") * 4;
        const fall = kind === "petals" || kind === "ink" || kind === "snow";
        const y = fall ? ((r("y") * height + frame * speed * 2.2) % (height + 60)) - 30 : height - ((r("y") * height + frame * speed * 1.4) % (height + 60)) + 30;
        const x = r("x") * width + Math.sin(frame / (30 + r("w") * 40) + i) * (kind === "petals" ? 60 : 22);
        const flicker = kind === "fireflies" ? 0.35 + 0.65 * Math.abs(Math.sin(frame / (12 + r("f") * 20) + i)) : 0.35 + r("o") * 0.4;
        const color = kind === "fireflies" || kind === "embers" ? "#FFD27A" : kind === "ink" ? "#151515" : kind === "petals" ? "#F6C9C9" : "#FFF6E0";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: kind === "petals" ? size * 0.6 : size,
              borderRadius: kind === "petals" ? "60% 0 60% 0" : 999,
              background: color,
              opacity: flicker,
              transform: kind === "petals" ? `rotate(${frame * (1 + r("r") * 2) + i * 40}deg)` : undefined,
              boxShadow: kind === "fireflies" || kind === "embers" ? `0 0 ${size * 3}px ${size}px ${withAlpha(color, 0.45)}` : undefined,
              filter: kind === "dust" || kind === "pollen" ? "blur(0.6px)" : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
}

/** Title / hype meter / captions over an illustrated scene, in the style's own type. */
export function StoryText({ scene, style, total, bottom = 330, scale = 1 }: { scene: Scene; style: ArtStyle; total: number; bottom?: number; scale?: number }) {
  const frame = useCurrentFrame();
  const font = fontFor(style.font);
  const inP = interpolate(frame, [4, 22], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outP = interpolate(frame, [total - 10, total], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shadow = `0 2px 24px ${withAlpha(style.scrim, 0.85)}, 0 0 2px ${withAlpha(style.scrim, 0.6)}`;
  const max = Math.max(1, Math.min(10, scene.scoreMax || 5));
  const hasMeter = scene.type === "verdict" || (scene.score ?? 0) > 0;
  const headline = scene.headline?.replace(/\*/g, "") ?? "";
  const caption = !headline && scene.captions?.find((c) => frame >= c.from && frame < c.to);
  const capP = caption ? interpolate(frame, [caption.from, caption.from + 6], [0, 1], { easing: easeOut, extrapolateRight: "clamp" }) : 0;

  return (
    <AbsoluteFill style={{ padding: `0 96px ${bottom}px`, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", textAlign: "center", gap: 26 }}>
      {scene.kicker && headline && (
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 28, letterSpacing: "0.24em", textTransform: "uppercase", color: withAlpha(style.ink, 0.85), opacity: inP * outP, textShadow: shadow }}>
          {scene.kicker}
        </div>
      )}
      {hasMeter && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: inP * outP }}>
          <div style={{ fontFamily: font, fontWeight: 700, fontSize: 190, lineHeight: 0.9, color: style.ink, textShadow: shadow }}>
            {scene.score}
            <span style={{ fontSize: 90, opacity: 0.6 }}> / {max}</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {Array.from({ length: max }, (_, i) => {
              const fill = i < scene.score ? interpolate(frame, [14 + i * 5, 26 + i * 5], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
              return (
                <div key={i} style={{ width: max > 5 ? 60 : 120, height: 28, borderRadius: 999, border: `2px solid ${withAlpha(style.ink, 0.7)}`, overflow: "hidden", boxShadow: shadow }}>
                  <div style={{ width: `${fill * 100}%`, height: "100%", background: style.ink }} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {headline && (
        <div
          style={{
            fontFamily: font,
            fontWeight: 700,
            fontSize: (headline.length <= 28 ? 96 : headline.length <= 50 ? 78 : 64) * scale,
            lineHeight: 1.05,
            letterSpacing: style.font === "roman" ? "0.04em" : "-0.01em",
            color: style.ink,
            textShadow: shadow,
            opacity: inP * outP,
            transform: `translateY(${(1 - inP) * 24}px)`,
            filter: `blur(${(1 - inP) * 8}px)`,
          }}
        >
          {headline}
        </div>
      )}
      {caption && (
        <div
          style={{
            fontFamily: style.font === "roman" ? serif : font,
            fontWeight: 600,
            fontSize: 58,
            lineHeight: 1.18,
            color: style.ink,
            textShadow: shadow,
            opacity: capP * outP,
            transform: `translateY(${(1 - capP) * 10}px)`,
          }}
        >
          {caption.text}
        </div>
      )}
    </AbsoluteFill>
  );
}
