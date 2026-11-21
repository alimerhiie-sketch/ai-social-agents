import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";
import { easeOut } from "../../brand";
import type { Cast } from "../looks";

// A front-facing cartoon person, rigged in code. Drawn through the look's cast (outline, fills, silhouette),
// so the same rig is a doodle, a paper cartoon or a lo-fi silhouette.

export type Action = "stand" | "wave" | "point" | "think" | "shrug" | "shock" | "happy" | "tired" | "type" | "phone" | "sit" | "walk" | "present";
export type Expr = "neutral" | "happy" | "sad" | "shock" | "tired" | "focus";

type Rig = { l: [number, number]; r: [number, number]; legs: "stand" | "sit" | "walk"; expr: Expr; tilt: number; slump: number };

const RIGS: Record<Action, Rig> = {
  stand: { l: [8, 6], r: [8, 6], legs: "stand", expr: "neutral", tilt: 0, slump: 0 },
  wave: { l: [8, 6], r: [150, 25], legs: "stand", expr: "happy", tilt: 3, slump: 0 },
  point: { l: [8, 6], r: [88, 4], legs: "stand", expr: "focus", tilt: 2, slump: 0 },
  think: { l: [12, -95], r: [14, -150], legs: "stand", expr: "focus", tilt: -6, slump: 0 },
  shrug: { l: [28, 105], r: [28, 105], legs: "stand", expr: "sad", tilt: 5, slump: 0 },
  shock: { l: [150, 15], r: [150, 15], legs: "stand", expr: "shock", tilt: 0, slump: 0 },
  happy: { l: [130, -25], r: [130, -25], legs: "stand", expr: "happy", tilt: 0, slump: 0 },
  tired: { l: [4, 2], r: [4, 2], legs: "sit", expr: "tired", tilt: -4, slump: 10 },
  type: { l: [22, -78], r: [22, -78], legs: "sit", expr: "focus", tilt: 0, slump: 2 },
  phone: { l: [14, -118], r: [14, -118], legs: "sit", expr: "focus", tilt: 6, slump: 4 },
  sit: { l: [16, -40], r: [16, -40], legs: "sit", expr: "neutral", tilt: 0, slump: 0 },
  walk: { l: [8, 6], r: [8, 6], legs: "walk", expr: "neutral", tilt: 0, slump: 0 },
  present: { l: [8, 6], r: [70, -40], legs: "stand", expr: "happy", tilt: 2, slump: 0 },
};

export const sitsDown = (a: Action) => RIGS[a]?.legs === "sit";

const rad = (d: number) => (d * Math.PI) / 180;

/** `width` = rendered width; the rig is 300×600. Returns where the hands are (rig units) for props. */
export function Person({ action = "stand", cast, width = 420, seed = 1, enter = 0, expr }: { action?: Action; cast: Cast; width?: number; seed?: number; enter?: number; expr?: Expr }) {
  const f = useCurrentFrame();
  const rig = RIGS[action] ?? RIGS.stand;
  const k = interpolate(f, [enter, enter + 10], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const from = RIGS.stand;
  const mix = (a: number, b: number) => a + (b - a) * k;
  const face = expr ?? rig.expr;
  const lw = cast.lineW;
  const ln = cast.line || "none";

  // life: breathing, typing jitter, waving
  const breath = Math.sin(f / 16) * 2;
  let la = mix(from.l[0], rig.l[0]);
  let lb = mix(from.l[1], rig.l[1]);
  let ra = mix(from.r[0], rig.r[0]) + Math.sin(f / 19 + 1) * 1.5;
  let rb = mix(from.r[1], rig.r[1]);
  if (action === "wave") rb += Math.sin(f / 3) * 22 * k;
  if (action === "type") {
    lb += Math.sin(f * 1.7) * 6;
    rb += Math.sin(f * 1.9 + 2) * 6;
  }
  if (action === "happy") {
    la += Math.sin(f / 4) * 6;
    ra += Math.sin(f / 4) * 6;
  }
  if (action === "shock") {
    la += Math.sin(f * 1.3) * 4;
    ra -= Math.sin(f * 1.3) * 4;
  }

  const walkPhase = Math.sin(f / 5);
  const bob = rig.legs === "walk" ? Math.abs(walkPhase) * -8 : breath * 0.5;
  const slump = mix(0, rig.slump);
  const tilt = mix(0, rig.tilt) + Math.sin(f / 27) * 1.2;

  const arm = (side: "l" | "r", a: number, b: number) => {
    const sx = side === "l" ? 92 : 208;
    const sy = 200 + slump;
    const dir = side === "l" ? -1 : 1;
    const v1 = [dir * Math.sin(rad(a)), Math.cos(rad(a))];
    const e = [sx + v1[0] * 82, sy + v1[1] * 82];
    const v2 = [dir * Math.sin(rad(a + b)), Math.cos(rad(a + b))];
    const h = [e[0] + v2[0] * 76, e[1] + v2[1] * 76];
    const d = `M${sx} ${sy} L${e[0]} ${e[1]} L${h[0]} ${h[1]}`;
    return { d, h };
  };
  const L = arm("l", la, lb);
  const R = arm("r", ra, rb);

  // legs
  const legs = () => {
    const hip = 338 + slump;
    if (rig.legs === "sit") {
      return [
        `M126 ${hip} L112 ${hip + 70} L112 ${hip + 160}`,
        `M174 ${hip} L188 ${hip + 70} L188 ${hip + 160}`,
      ];
    }
    const sw = rig.legs === "walk" ? walkPhase * 16 : 0;
    return [`M128 ${hip} L${122 - sw} ${hip + 110} L${120 - sw * 1.6} 560`, `M172 ${hip} L${178 + sw} ${hip + 110} L${180 + sw * 1.6} 560`];
  };
  const legPaths = legs();
  const feetY = rig.legs === "sit" ? 338 + slump + 168 : 566;
  const feet = rig.legs === "sit" ? [112, 188] : [120 - (rig.legs === "walk" ? walkPhase * 25 : 0), 180 + (rig.legs === "walk" ? walkPhase * 25 : 0)];

  // face
  const period = 80 + Math.floor(random(`pb${seed}`) * 50);
  const ph = (f + Math.floor(random(`pp${seed}`) * period)) % period;
  const blink = ph < 4 ? 0.12 : 1;
  const eyeY = 112;
  const look = face === "focus" ? 4 : 0;
  const eyes = () => {
    if (cast.silhouette) return null;
    if (face === "tired")
      return (
        <>
          <path d={`M120 ${eyeY} Q130 ${eyeY + 6} 140 ${eyeY}`} stroke={cast.line || "#222"} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d={`M160 ${eyeY} Q170 ${eyeY + 6} 180 ${eyeY}`} stroke={cast.line || "#222"} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d={`M118 ${eyeY + 14} Q130 ${eyeY + 20} 142 ${eyeY + 14}`} stroke={cast.line || "#222"} strokeOpacity={0.4} strokeWidth={3} fill="none" />
          <path d={`M158 ${eyeY + 14} Q170 ${eyeY + 20} 182 ${eyeY + 14}`} stroke={cast.line || "#222"} strokeOpacity={0.4} strokeWidth={3} fill="none" />
        </>
      );
    if (face === "happy")
      return (
        <>
          <path d={`M120 ${eyeY + 4} Q130 ${eyeY - 8} 140 ${eyeY + 4}`} stroke={cast.line || "#222"} strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d={`M160 ${eyeY + 4} Q170 ${eyeY - 8} 180 ${eyeY + 4}`} stroke={cast.line || "#222"} strokeWidth={5} fill="none" strokeLinecap="round" />
        </>
      );
    const r = face === "shock" ? 9 : 6.5;
    return (
      <g transform={`translate(${look} 0)`}>
        <ellipse cx={130} cy={eyeY} rx={r} ry={r * blink * (face === "shock" ? 1.2 : 1)} fill={cast.line || "#222"} />
        <ellipse cx={170} cy={eyeY} rx={r} ry={r * blink * (face === "shock" ? 1.2 : 1)} fill={cast.line || "#222"} />
      </g>
    );
  };
  const brows = () => {
    if (cast.silhouette) return null;
    const c = cast.line || "#222";
    const lift = face === "shock" ? -10 : face === "sad" ? 0 : 0;
    const angle = face === "sad" ? 10 : face === "focus" ? -8 : 0;
    return (
      <>
        <path d={`M118 ${94 + lift} L142 ${94 + lift}`} stroke={c} strokeWidth={4} strokeLinecap="round" transform={`rotate(${-angle} 130 ${94 + lift})`} />
        <path d={`M158 ${94 + lift} L182 ${94 + lift}`} stroke={c} strokeWidth={4} strokeLinecap="round" transform={`rotate(${angle} 170 ${94 + lift})`} />
      </>
    );
  };
  const mouth = () => {
    if (cast.silhouette) return null;
    const c = cast.line || "#222";
    switch (face) {
      case "happy":
        return <path d="M130 136 Q150 156 170 136" stroke={c} strokeWidth={5} fill="#FFFFFF" strokeLinejoin="round" />;
      case "shock":
        return <ellipse cx={150} cy={145} rx={11} ry={15 + Math.sin(f / 3) * 2} fill={c} />;
      case "sad":
        return <path d="M134 148 Q150 136 166 148" stroke={c} strokeWidth={5} fill="none" strokeLinecap="round" />;
      case "tired":
        return <path d="M138 145 L162 145" stroke={c} strokeWidth={5} strokeLinecap="round" />;
      default:
        return <path d="M136 142 Q150 148 164 142" stroke={c} strokeWidth={5} fill="none" strokeLinecap="round" />;
    }
  };
  const hair = () => {
    if (cast.hairStyle === "bald" || cast.hairStyle === "none") return null;
    if (cast.hairStyle === "messy") {
      const spikes = Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI + (i / 10) * Math.PI;
        const r1 = 60;
        const r2 = 78 + random(`h${seed}${i}`) * 16 + Math.sin(f / 9 + i) * 2;
        return `L${150 + Math.cos(a) * r2} ${104 + Math.sin(a) * r2} L${150 + Math.cos(a + 0.15) * r1} ${104 + Math.sin(a + 0.15) * r1}`;
      }).join(" ");
      return <path d={`M88 104 ${spikes} Z`} fill={cast.hair} stroke={ln} strokeWidth={lw} strokeLinejoin="round" />;
    }
    return <path d="M90 100 Q92 40 150 40 Q208 40 210 100 Q190 70 150 72 Q110 70 90 100 Z" fill={cast.hair} stroke={ln} strokeWidth={lw} strokeLinejoin="round" />;
  };

  const limbW = 30;
  const limb = (d: string, color: string, w = limbW) => (
    <>
      {cast.line && <path d={d} stroke={cast.line} strokeWidth={w + lw * 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      <path d={d} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  const hand = (h: number[]) => <circle cx={h[0]} cy={h[1]} r={16} fill={cast.silhouette ? cast.shirt : cast.skin} stroke={ln} strokeWidth={lw} />;

  return (
    <svg width={width} height={width * 2} viewBox="0 0 300 600" style={{ overflow: "visible" }}>
      <g transform={`translate(0 ${bob})`}>
        {/* legs */}
        {legPaths.map((d, i) => (
          <React.Fragment key={i}>{limb(d, cast.pants, 34)}</React.Fragment>
        ))}
        {feet.map((x, i) => (
          <ellipse key={i} cx={x + (i ? 8 : -8)} cy={feetY} rx={26} ry={13} fill={cast.shoes} stroke={ln} strokeWidth={lw} />
        ))}
        {/* torso */}
        <path
          d={`M96 ${188 + slump} Q150 ${172 + slump} 204 ${188 + slump} L214 340 Q150 356 86 340 Z`}
          fill={cast.shirt}
          stroke={ln}
          strokeWidth={lw}
          strokeLinejoin="round"
        />
        {cast.silhouette && <path d={`M108 ${196 + slump} Q150 ${232 + slump} 192 ${196 + slump}`} stroke="rgba(255,255,255,0.12)" strokeWidth={4} fill="none" />}
        {/* arms */}
        {limb(L.d, cast.shirt)}
        {limb(R.d, cast.shirt)}
        {hand(L.h)}
        {hand(R.h)}
        {/* head */}
        <g transform={`rotate(${tilt} 150 170) translate(0 ${slump * 0.8})`}>
          <rect x={136} y={150} width={28} height={36} fill={cast.skin} stroke={ln} strokeWidth={lw} />
          {hair()}
          <circle cx={150} cy={108} r={62} fill={cast.skin} stroke={ln} strokeWidth={lw} />
          {cast.hairStyle === "messy" && <path d="M92 92 Q120 60 150 66 Q182 60 208 92" fill="none" stroke={ln} strokeWidth={lw} />}
          {eyes()}
          {brows()}
          {mouth()}
          {face === "shock" && !cast.silhouette && (
            <path d={`M214 ${86 + (f % 20)} q6 10 0 16 q-6 -6 0 -16`} fill="#8CCBF0" stroke={ln} strokeWidth={2} opacity={0.9} />
          )}
        </g>
      </g>
    </svg>
  );
}

/** Hand positions (rig units) for an action, so props can sit in the hands. */
export function handsFor(action: Action) {
  const rig = RIGS[action] ?? RIGS.stand;
  const pos = (side: "l" | "r", a: number, b: number) => {
    const sx = side === "l" ? 92 : 208;
    const sy = 200 + rig.slump;
    const dir = side === "l" ? -1 : 1;
    const e = [sx + dir * Math.sin(rad(a)) * 82, sy + Math.cos(rad(a)) * 82];
    return [e[0] + dir * Math.sin(rad(a + b)) * 76, e[1] + Math.cos(rad(a + b)) * 76];
  };
  return { l: pos("l", rig.l[0], rig.l[1]), r: pos("r", rig.r[0], rig.r[1]) };
}
