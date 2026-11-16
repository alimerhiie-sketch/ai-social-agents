import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { body, display, withAlpha } from "./brand";
import { styleById } from "./artStyles";
import { Field } from "./components/primitives";
import { SceneView, type Layout } from "./components/scenes";
import { Atmosphere, StoryText } from "./components/illustration";
import type { Palette, SlideProps } from "./types";

// 1080×1350 feed slides. The same scenes as the reels, rendered settled (no exit).
export const SLIDE_SETTLED_FRAME = 150;
const SLIDE_LAYOUT: Layout = { top: 210, right: 96, bottom: 190, left: 96, s: 0.86, align: "center" };

export function Slide({ scene, index, total, palette: brandPalette, handle, isCover, artStyle }: SlideProps) {
  const style = artStyle ? styleById(artStyle) : null;
  const palette: Palette = style ? { field: style.scrim, deep: style.scrim, soft: style.glow || style.ink, ink: style.ink } : brandPalette;
  const painted = style && scene.type === "illustration";
  return (
    <AbsoluteFill style={{ background: palette.field }}>
      {/* rendered at SLIDE_SETTLED_FRAME, after every entrance has landed */}
      {painted ? (
        <>
          {scene.imageSrc && <Img src={scene.imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover", filter: style.grade }} />}
          <Atmosphere style={style} still />
          <StoryText scene={scene} style={style} total={100000} bottom={200} scale={0.92} />
        </>
      ) : style ? (
        <>
          <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, ${withAlpha(style.glow || style.ink, 0.16)} 0%, transparent 62%), ${style.scrim}` }} />
          <Atmosphere style={{ ...style, particles: "none" }} still />
          <SceneView scene={scene} palette={palette} total={Infinity} L={SLIDE_LAYOUT} handle={handle} />
        </>
      ) : (
        <>
          <Field palette={palette} still />
          <SceneView scene={scene} palette={palette} total={Infinity} L={SLIDE_LAYOUT} handle={handle} />
        </>
      )}

      {/* slide counter as an edit timeline: one clip per slide */}
      {total > 1 && (
        <div style={{ position: "absolute", top: 92, left: 96, right: 96, display: "flex", gap: 10 }}>
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: i === index ? 14 : 10,
                marginTop: i === index ? 0 : 2,
                borderRadius: 999,
                background: i < index ? palette.soft : i === index ? palette.ink : withAlpha(palette.ink, 0.2),
              }}
            />
          ))}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 84,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: body,
          fontWeight: 600,
          fontSize: 26,
          letterSpacing: "0.06em",
          color: withAlpha(palette.ink, 0.7),
        }}
      >
        <span style={{ fontFamily: display, fontWeight: 700 }}>@{handle}</span>
        {isCover && total > 1 ? (
          <span style={{ display: "flex", alignItems: "center", gap: 14, color: palette.ink }}>
            SWIPE
            <span style={{ display: "flex", gap: 6 }}>
              <span style={{ width: 54, height: 14, borderRadius: 999, background: palette.ink }} />
              <span style={{ width: 22, height: 14, borderRadius: 999, background: palette.soft }} />
            </span>
          </span>
        ) : total > 1 ? (
          <span>
            {index + 1}/{total}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
