import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame } from "remotion";
import { body, easeOut, SAFE, withAlpha } from "./brand";
import { styleById, type ArtStyle } from "./artStyles";
import { Field } from "./components/primitives";
import { SceneView, type Layout } from "./components/scenes";
import { Atmosphere, IllustrationLayer, OVERLAP, StoryText } from "./components/illustration";
import type { Palette, ReelProps, Scene } from "./types";

export const REEL_LAYOUT: Layout = { ...SAFE, s: 1.12, align: "center" };

export const sceneFrames = (s: Scene) => s.durationInFrames ?? Math.round((s.seconds || 3) * 30);

/** In an illustrated reel, the text-only scenes (steps, stat, compare…) take the style's colours. */
const paletteFromStyle = (st: ArtStyle): Palette => ({ field: st.scrim, deep: st.scrim, soft: st.glow || st.ink, ink: st.ink });

export function Reel({ scenes, palette, handle, showCaptions, artStyle }: ReelProps) {
  const style = artStyle ? styleById(artStyle) : null;
  const textPalette = style ? paletteFromStyle(style) : palette;

  let from = 0;
  const placed = scenes.map((scene) => {
    const d = sceneFrames(scene);
    const p = { scene, from, d };
    from += d;
    return p;
  });

  return (
    <AbsoluteFill style={{ background: style ? style.scrim : palette.deep }}>
      {/* 1. backgrounds: painted scenes (overlapping into the next one's transition) or the brand field */}
      {placed.map(({ scene, from, d }, i) => {
        const next = placed[i + 1];
        const prev = placed[i - 1];
        if (scene.type === "illustration" && style) {
          const len = d + (next ? OVERLAP : 0);
          return (
            <Sequence key={`bg${i}`} from={from} durationInFrames={len} name={`${i + 1}. painting`}>
              <IllustrationLayer scene={scene} style={style} length={len} enter={!!prev} />
            </Sequence>
          );
        }
        return (
          <Sequence key={`bg${i}`} from={from} durationInFrames={d} name={`${i + 1}. field`}>
            {style ? <StyleField style={style} /> : <Field palette={palette} />}
          </Sequence>
        );
      })}

      {style && <Atmosphere style={style} />}

      {/* 2. words, voice and captions */}
      {placed.map(({ scene, from, d }, i) => (
        <Sequence key={`fg${i}`} from={from} durationInFrames={d} name={`${i + 1}. ${scene.type}`}>
          {scene.type === "illustration" && style ? (
            <StoryText scene={scene} style={style} total={d} />
          ) : (
            <>
              <SceneView scene={scene} palette={textPalette} total={d} L={REEL_LAYOUT} handle={handle} />
              {showCaptions && scene.captions && <Captions captions={scene.captions} palette={textPalette} />}
            </>
          )}
          {/* voice starts a beat after the scene, once the first words are landing (AUDIO_DELAY in render.mjs) */}
          {scene.audioSrc && (
            <Sequence from={6} layout="none">
              <Audio src={scene.audioSrc} />
            </Sequence>
          )}
        </Sequence>
      ))}

      <TimelineBar placed={placed} palette={textPalette} />
    </AbsoluteFill>
  );
}

/** Plain painted-paper ground for text scenes inside an illustrated reel. */
function StyleField({ style }: { style: ArtStyle }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 35%, ${withAlpha(style.glow || style.ink, 0.18)} 0%, transparent 60%), ${style.scrim}`,
      }}
    />
  );
}

/** The video's own edit timeline, AMX-pill style: one clip per scene, filling as it plays. */
function TimelineBar({ placed, palette }: { placed: { from: number; d: number }[]; palette: Palette }) {
  const frame = useCurrentFrame();
  const total = placed.reduce((a, p) => a + p.d, 0);
  const intro = interpolate(frame, [0, 18], [0, 1], { easing: easeOut, extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 196,
        left: SAFE.left,
        right: SAFE.left,
        display: "flex",
        gap: 10,
        opacity: intro * 0.9,
        transform: `translateY(${(1 - intro) * -12}px)`,
      }}
    >
      {placed.map((p, i) => {
        const fill = interpolate(frame, [p.from, p.from + p.d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const active = frame >= p.from && frame < p.from + p.d;
        return (
          <div
            key={i}
            style={{
              flexGrow: p.d / total,
              flexBasis: 0,
              height: active ? 12 : 8,
              marginTop: active ? 0 : 2,
              borderRadius: 999,
              background: withAlpha(palette.ink, 0.22),
              overflow: "hidden",
              boxShadow: `0 1px 8px ${withAlpha("#000000", 0.15)}`,
            }}
          >
            <div style={{ width: `${fill * 100}%`, height: "100%", background: palette.ink }} />
          </div>
        );
      })}
    </div>
  );
}

/** Phrase captions for sound-off viewers: quiet, low, never a coloured box. */
function Captions({ captions, palette }: { captions: { text: string; from: number; to: number }[]; palette: Palette }) {
  const frame = useCurrentFrame();
  const c = captions.find((x) => frame >= x.from && frame < x.to);
  if (!c) return null;
  const p = interpolate(frame, [c.from, c.from + 5], [0, 1], { easing: easeOut, extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        right: SAFE.right,
        bottom: SAFE.bottom - 120,
        fontFamily: body,
        fontWeight: 600,
        fontSize: 40,
        lineHeight: 1.25,
        color: palette.ink,
        opacity: p * 0.92,
        transform: `translateY(${(1 - p) * 8}px)`,
        textShadow: `0 2px 18px ${withAlpha(palette.deep, 0.6)}`,
      }}
    >
      {c.text}
    </div>
  );
}
