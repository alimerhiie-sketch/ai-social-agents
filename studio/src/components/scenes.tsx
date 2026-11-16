import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { body, display, easeOut, ENTER, withAlpha } from "../brand";
import type { Palette, Scene } from "../types";
import { Hairline, Kicker, Reveal, SceneExit, useEnter } from "./primitives";

/** Where a scene may draw, and how big its type is. Reels and feed slides share the scenes. */
export type Layout = { top: number; right: number; bottom: number; left: number; s: number; align: "center" | "top" };

type P = { scene: Scene; palette: Palette; total: number; L: Layout };

const plain = (t: string) => t.replace(/\*/g, "");

/** Headline size from its length, so short hooks hit hard and long ones still fit. */
function headSize(text: string, s: number, base = 118) {
  const n = plain(text).length;
  const k = n <= 22 ? 1 : n <= 40 ? 0.84 : n <= 64 ? 0.7 : 0.6;
  return Math.round(base * k * s);
}

function Frame({ L, children, gap = 40 }: { L: Layout; children: React.ReactNode; gap?: number }) {
  return (
    <AbsoluteFill
      style={{
        padding: `${L.top}px ${L.right}px ${L.bottom}px ${L.left}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: L.align === "center" ? "center" : "flex-start",
        gap: gap * L.s,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

const H = (palette: Palette, size: number): React.CSSProperties => ({
  fontFamily: display,
  fontWeight: 800,
  fontSize: size,
  lineHeight: 1.02,
  letterSpacing: "-0.025em",
  color: palette.ink,
});

const B = (palette: Palette, size: number, alpha = 0.82): React.CSSProperties => ({
  fontFamily: body,
  fontWeight: 500,
  fontSize: size,
  lineHeight: 1.3,
  color: withAlpha(palette.ink, alpha),
});

// ---------------------------------------------------------------------------

function Hook({ scene, palette, total, L }: P) {
  const size = headSize(scene.headline, L.s, 128);
  const words = plain(scene.headline).split(/\s+/).length;
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={44}>
        <Kicker text={scene.kicker} palette={palette} size={30 * L.s} />
        <Reveal text={scene.headline} start={4} palette={palette} style={H(palette, size)} />
        <Hairline start={8 + words * 2.5} palette={palette} width="38%" />
        {scene.subline && <Reveal text={scene.subline} start={14 + words * 2.5} palette={palette} style={B(palette, 44 * L.s)} stagger={1.5} />}
      </Frame>
    </SceneExit>
  );
}

function Statement({ scene, palette, total, L }: P) {
  const size = headSize(scene.headline, L.s, 104);
  const words = plain(scene.headline).split(/\s+/).length;
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={38}>
        <Kicker text={scene.kicker} palette={palette} size={28 * L.s} />
        <Reveal text={scene.headline} start={2} palette={palette} style={H(palette, size)} />
        {scene.subline && <Reveal text={scene.subline} start={10 + words * 2.5} palette={palette} style={B(palette, 46 * L.s)} stagger={1.5} />}
      </Frame>
    </SceneExit>
  );
}

function List({ scene, palette, total, L }: P) {
  const items = scene.items.slice(0, 6);
  const itemSize = (items.length > 4 ? 44 : 50) * L.s;
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={34}>
        <Kicker text={scene.kicker} palette={palette} size={28 * L.s} />
        {scene.headline && <Reveal text={scene.headline} start={2} palette={palette} style={H(palette, headSize(scene.headline, L.s, 88))} />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((it, i) => (
            <Row key={i} start={14 + i * 7} palette={palette} L={L} size={itemSize} last={i === items.length - 1}>
              <div style={{ width: 46 * L.s, height: 16 * L.s, borderRadius: 999, background: i === 0 ? palette.ink : palette.soft, flexShrink: 0, marginTop: itemSize * 0.42 }} />
              <Reveal text={it} start={16 + i * 7} palette={palette} stagger={1.2} style={{ ...B(palette, itemSize, 0.95), fontWeight: 600 }} />
            </Row>
          ))}
        </div>
      </Frame>
    </SceneExit>
  );
}

function Row({ start, palette, L, size, last, children }: { start: number; palette: Palette; L: Layout; size: number; last: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: size * 0.5, paddingTop: size * 0.5 }}>
      <div style={{ display: "flex", gap: 26 * L.s, alignItems: "flex-start" }}>{children}</div>
      {!last && <Hairline start={start + 4} palette={palette} opacity={0.18} />}
    </div>
  );
}

function Steps({ scene, palette, total, L }: P) {
  const items = scene.items.slice(0, 5);
  const size = (items.length > 3 ? 44 : 50) * L.s;
  const frame = useCurrentFrame();
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={36}>
        <Kicker text={scene.kicker} palette={palette} size={28 * L.s} />
        {scene.headline && <Reveal text={scene.headline} start={2} palette={palette} style={H(palette, headSize(scene.headline, L.s, 86))} />}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: size * 1.05, paddingLeft: 118 * L.s, marginTop: 10 * L.s }}>
          {/* connector drawing down through the step numbers */}
          <div
            style={{
              position: "absolute",
              left: 38 * L.s,
              top: size * 0.6,
              bottom: size * 0.6,
              width: 2,
              background: withAlpha(palette.soft, 0.55),
              transformOrigin: "top",
              transform: `scaleY(${interpolate(frame, [12, 12 + items.length * 10], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`,
            }}
          />
          {items.map((it, i) => {
            const s = 14 + i * 10;
            const p = interpolate(frame, [s, s + ENTER], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={i} style={{ position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: -118 * L.s,
                    top: -6 * L.s,
                    width: 78 * L.s,
                    height: 78 * L.s,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background: i === 0 ? palette.ink : palette.field,
                    border: `2px solid ${palette.soft}`,
                    fontFamily: display,
                    fontWeight: 700,
                    fontSize: 30 * L.s,
                    color: i === 0 ? palette.deep : palette.ink,
                    opacity: p,
                    transform: `scale(${0.6 + p * 0.4})`,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <Reveal text={it.replace(/^\s*\d+[.)]\s*/, "")} start={s + 2} palette={palette} stagger={1.2} style={{ ...B(palette, size, 0.95), fontWeight: 600 }} />
              </div>
            );
          })}
        </div>
      </Frame>
    </SceneExit>
  );
}

function Stat({ scene, palette, total, L }: P) {
  const frame = useCurrentFrame();
  const m = scene.number.match(/^([^\d]*)([\d.,]+)(.*)$/);
  const target = m ? parseFloat(m[2].replace(/,/g, "")) : NaN;
  const decimals = m && m[2].includes(".") ? m[2].split(".")[1].length : 0;
  const k = interpolate(frame, [6, 6 + 34], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shown = m && Number.isFinite(target) ? `${m[1]}${(target * k).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}` : scene.number;
  const p = useEnter(4, ENTER + 6);
  const size = (scene.number.length <= 4 ? 300 : scene.number.length <= 7 ? 220 : 160) * L.s;
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={26}>
        <Kicker text={scene.kicker} palette={palette} size={28 * L.s} />
        <div style={{ ...H(palette, size), letterSpacing: "-0.05em", opacity: p, filter: `blur(${(1 - p) * 12}px)`, fontVariantNumeric: "tabular-nums" }}>{shown}</div>
        <Hairline start={16} palette={palette} width="30%" />
        <Reveal text={scene.numberLabel || scene.headline} start={18} palette={palette} style={{ ...H(palette, 58 * L.s), fontWeight: 700 }} stagger={1.8} />
        {scene.subline && <Reveal text={scene.subline} start={28} palette={palette} style={B(palette, 40 * L.s)} stagger={1.2} />}
      </Frame>
    </SceneExit>
  );
}

function Compare({ scene, palette, total, L }: P) {
  const frame = useCurrentFrame();
  const div = interpolate(frame, [10, 34], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const side = (s: { label: string; value: string }, start: number, strong: boolean) => {
    const p = useEnter(start);
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 * L.s, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, filter: `blur(${(1 - p) * 8}px)` }}>
        <div style={{ fontFamily: body, fontWeight: 600, fontSize: 26 * L.s, letterSpacing: "0.18em", textTransform: "uppercase", color: palette.soft }}>{s.label}</div>
        <div style={{ ...H(palette, (s.value.length > 26 ? 50 : 64) * L.s), fontWeight: strong ? 800 : 600, color: strong ? palette.ink : withAlpha(palette.ink, 0.72) }}>{s.value}</div>
      </div>
    );
  };
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={48}>
        <Kicker text={scene.kicker} palette={palette} size={28 * L.s} />
        {scene.headline && <Reveal text={scene.headline} start={2} palette={palette} style={H(palette, headSize(scene.headline, L.s, 84))} />}
        <div style={{ display: "flex", gap: 44 * L.s, alignItems: "stretch" }}>
          {side(scene.left, 10, false)}
          <div style={{ width: 2, background: withAlpha(palette.ink, 0.35), transformOrigin: "top", transform: `scaleY(${div})` }} />
          {side(scene.right, 16, true)}
        </div>
        {scene.subline && <Reveal text={scene.subline} start={26} palette={palette} style={B(palette, 40 * L.s)} stagger={1.2} />}
      </Frame>
    </SceneExit>
  );
}

function Verdict({ scene, palette, total, L }: P) {
  const frame = useCurrentFrame();
  const max = Math.max(1, Math.min(10, scene.scoreMax || 5));
  const score = Math.max(0, Math.min(max, scene.score));
  const gap = 14 * L.s;
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={40}>
        <Kicker text={scene.kicker || "Hype meter"} palette={palette} size={28 * L.s} />
        <div style={{ display: "flex", alignItems: "flex-end", gap: 34 * L.s }}>
          <div style={{ ...H(palette, 200 * L.s), letterSpacing: "-0.05em", opacity: useEnter(18) }}>
            {score}
            <span style={{ color: withAlpha(palette.ink, 0.45), fontSize: 96 * L.s, marginLeft: 12 * L.s, letterSpacing: "-0.02em" }}>/ {max}</span>
          </div>
        </div>
        {/* the meter: a row of clip pills that fill to the score */}
        <div style={{ display: "flex", gap }}>
          {Array.from({ length: max }, (_, i) => {
            const s = 6 + i * 4;
            const appear = interpolate(frame, [s, s + 12], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const fill = i < score ? interpolate(frame, [18 + i * 5, 30 + i * 5], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
            return (
              <div key={i} style={{ flex: 1, height: 40 * L.s, borderRadius: 999, border: `2px solid ${withAlpha(palette.ink, 0.5)}`, overflow: "hidden", opacity: appear }}>
                <div style={{ width: `${fill * 100}%`, height: "100%", background: i === score - 1 ? palette.soft : palette.ink }} />
              </div>
            );
          })}
        </div>
        <Reveal text={scene.headline} start={24} palette={palette} style={{ ...H(palette, headSize(scene.headline, L.s, 80)), fontWeight: 700 }} stagger={1.8} />
        {scene.subline && <Reveal text={scene.subline} start={34} palette={palette} style={B(palette, 40 * L.s)} stagger={1.2} />}
      </Frame>
    </SceneExit>
  );
}

function Cta({ scene, palette, total, L, handle }: P & { handle: string }) {
  const frame = useCurrentFrame();
  const pills = [
    { w: 300, c: palette.deep },
    { w: 120, c: palette.soft },
    { w: 210, c: palette.ink },
  ];
  return (
    <SceneExit total={total}>
      <Frame L={L} gap={42}>
        <Reveal text={scene.headline} start={2} palette={palette} style={H(palette, headSize(scene.headline, L.s, 96))} />
        {scene.subline && <Reveal text={scene.subline} start={14} palette={palette} style={B(palette, 42 * L.s)} stagger={1.4} />}
        {/* the logo pills slide in like clips dropping onto a timeline */}
        <div style={{ display: "flex", gap: 14 * L.s, marginTop: 20 * L.s }}>
          {pills.map((p, i) => {
            const k = interpolate(frame, [20 + i * 4, 36 + i * 4], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return <div key={i} style={{ width: p.w * L.s, height: 30 * L.s, borderRadius: 999, background: p.c, opacity: k, transform: `translateX(${(1 - k) * 120}px)`, filter: `blur(${(1 - k) * 6}px)` }} />;
          })}
        </div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 46 * L.s, letterSpacing: "0.02em", color: palette.ink, opacity: useEnter(30) }}>@{handle}</div>
      </Frame>
    </SceneExit>
  );
}

export function SceneView(props: P & { handle: string }) {
  switch (props.scene.type) {
    case "hook":
      return <Hook {...props} />;
    case "list":
      return <List {...props} />;
    case "steps":
      return <Steps {...props} />;
    case "stat":
      return <Stat {...props} />;
    case "compare":
      return <Compare {...props} />;
    case "verdict":
      return <Verdict {...props} />;
    case "cta":
      return <Cta {...props} />;
    default:
      return <Statement {...props} />;
  }
}
