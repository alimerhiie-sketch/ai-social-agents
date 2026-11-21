import React from "react";
import { interpolate, random, useCurrentFrame } from "remotion";
import { easeOut } from "../brand";
import type { Pose } from "../types";

// The recurring character, drawn and rigged in code so it is the same character in every frame of every reel.
// Default colours are Pip (paper-white robot, one glowing blue eye, navy knitted scarf).

export type MascotColors = { body: string; eye: string; scarf: string };
export const PIP: MascotColors = { body: "#F4F6FB", eye: "#6FB2FF", scarf: "#1B2A6B" };

type Arms = { l: number; r: number; lookX: number; lookY: number; lift: number };

const POSES: Record<Pose, Arms> = {
  idle: { l: 14, r: -14, lookX: 0, lookY: 0, lift: 0 },
  wave: { l: 16, r: -150, lookX: 6, lookY: -2, lift: 4 },
  point: { l: 12, r: -92, lookX: 20, lookY: 0, lift: 0 },
  think: { l: 14, r: -150, lookX: -16, lookY: -14, lift: 0 },
  shrug: { l: 118, r: -118, lookX: 0, lookY: -4, lift: 6 },
  cheer: { l: 160, r: -160, lookX: 0, lookY: -6, lift: 22 },
  hold: { l: -38, r: 38, lookX: 0, lookY: 14, lift: 0 },
  surprised: { l: 96, r: -96, lookX: 0, lookY: 0, lift: 12 },
};

/** `frame` is local to the beat; `seed` keeps blinks different per appearance. */
export function Mascot({ pose = "idle", size = 460, colors = PIP, seed = 1, enter = 0 }: { pose?: Pose; size?: number; colors?: MascotColors; seed?: number; enter?: number }) {
  const frame = useCurrentFrame();
  const t = frame;
  const k = interpolate(frame, [enter, enter + 12], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const from = POSES.idle;
  const to = POSES[pose] ?? POSES.idle;
  const mix = (a: number, b: number) => a + (b - a) * k;

  let l = mix(from.l, to.l) + Math.sin(t / 11) * 3;
  let r = mix(from.r, to.r) - Math.sin(t / 13 + 1) * 3;
  if (pose === "wave") r += Math.sin(t / 3.2) * 16 * k;
  if (pose === "cheer") {
    l += Math.sin(t / 4) * 6 * k;
    r -= Math.sin(t / 4) * 6 * k;
  }
  const hover = Math.sin(t / 14) * 9 + mix(0, to.lift);
  const lookX = mix(from.lookX, to.lookX) + Math.sin(t / 37) * 3;
  const lookY = mix(from.lookY, to.lookY) + Math.cos(t / 41) * 2;

  // blinks at seeded moments
  const period = 70 + Math.floor(random(`blink${seed}`) * 40);
  const ph = (t + Math.floor(random(`ph${seed}`) * period)) % period;
  const blink = ph < 5 ? 1 - Math.sin((ph / 5) * Math.PI) * 0.92 : 1;
  const happy = pose === "cheer";
  const eyeR = pose === "surprised" ? 36 : 29;
  const tilt = pose === "think" ? -6 * k : pose === "shrug" ? Math.sin(t / 9) * 3 * k : Math.sin(t / 29) * 1.5;
  const antenna = Math.sin(t / 7) * 7 + Math.sin(t / 3.1) * 2;
  const scarfWave = (i: number) => Math.sin(t / 8 - i * 0.9) * (6 + i * 3);
  const uid = `m${seed}`;
  const tail = `M250 340 C ${262 + scarfWave(0)} 372, ${258 + scarfWave(1)} 404, ${272 + scarfWave(2)} 436 L ${310 + scarfWave(2)} 430 C ${296 + scarfWave(1)} 398, ${298 + scarfWave(0)} 366, 290 334 Z`;

  const arm = (side: "l" | "r", angle: number) => {
    const px = side === "l" ? 78 : 322;
    return (
      <g transform={`rotate(${angle} ${px} 262)`}>
        <rect x={px - 16} y={256} width={32} height={112} rx={16} fill={`url(#${uid}-limb)`} />
        <circle cx={px} cy={372} r={22} fill={`url(#${uid}-limb)`} />
      </g>
    );
  };

  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 400 480" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`${uid}-body`} cx="36%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="48%" stopColor={colors.body} />
          <stop offset="100%" stopColor="#AEB8CF" />
        </radialGradient>
        <linearGradient id={`${uid}-limb`} x1="0" x2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#B9C2D8" />
        </linearGradient>
        <radialGradient id={`${uid}-visor`} cx="40%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#24305F" />
          <stop offset="100%" stopColor="#080D2A" />
        </radialGradient>
        <radialGradient id={`${uid}-eye`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#CFE6FF" />
          <stop offset="100%" stopColor={colors.eye} />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <pattern id={`${uid}-knit`} width="10" height="12" patternUnits="userSpaceOnUse">
          <path d="M1 2 L5 8 L9 2" stroke="rgba(255,255,255,0.13)" strokeWidth="2" fill="none" />
        </pattern>
      </defs>

      {/* contact shadow: smaller and fainter as Pip rises */}
      <ellipse cx={200} cy={462} rx={118 - hover * 1.1} ry={16} fill="rgba(0,0,0,0.34)" filter={`url(#${uid}-soft)`} />

      <g transform={`translate(0 ${-hover}) rotate(${tilt} 200 260)`}>
        {arm("l", l)}
        {arm("r", r)}

        {/* antenna */}
        <g transform={`rotate(${antenna} 200 92)`}>
          <rect x={196} y={52} width={8} height={44} rx={4} fill="#C9D1E3" />
          <circle cx={200} cy={48} r={13} fill={colors.eye} />
          <circle cx={200} cy={48} r={16} fill={colors.eye} opacity={0.45} filter={`url(#${uid}-glow)`} />
        </g>

        {/* body */}
        <ellipse cx={200} cy={250} rx={154} ry={160} fill={`url(#${uid}-body)`} />
        <ellipse cx={142} cy={160} rx={46} ry={26} fill="#FFFFFF" opacity={0.75} transform="rotate(-28 142 160)" />
        {/* rim light from the brand side */}
        <path d="M330 170 A154 160 0 0 1 300 380" stroke={colors.eye} strokeOpacity={0.35} strokeWidth={5} fill="none" strokeLinecap="round" />

        {/* visor + eye */}
        <rect x={102} y={156} width={196} height={118} rx={56} fill={`url(#${uid}-visor)`} />
        <rect x={120} y={166} width={90} height={18} rx={9} fill="#FFFFFF" opacity={0.08} />
        <g transform={`translate(${200 + lookX} ${215 + lookY})`}>
          {happy ? (
            <>
              <path d="M-26 8 Q0 -26 26 8" stroke={colors.eye} strokeWidth={22} strokeLinecap="round" fill="none" opacity={0.6} filter={`url(#${uid}-glow)`} />
              <path d="M-26 8 Q0 -26 26 8" stroke="#DDEEFF" strokeWidth={11} strokeLinecap="round" fill="none" />
            </>
          ) : (
            <g transform={`scale(1 ${blink})`}>
              <circle r={eyeR + 14} fill={colors.eye} opacity={0.55} filter={`url(#${uid}-glow)`} />
              <circle r={eyeR} fill={`url(#${uid}-eye)`} />
              <circle cx={-9} cy={-10} r={7} fill="#FFFFFF" opacity={0.9} />
            </g>
          )}
        </g>

        {/* knitted scarf wrapped under the visor, with a tail that moves */}
        <path d="M56 292 Q200 336 344 292 L334 334 Q200 380 66 334 Z" fill={colors.scarf} />
        <path d="M56 292 Q200 336 344 292 L334 334 Q200 380 66 334 Z" fill={`url(#${uid}-knit)`} />
        <path d="M56 292 Q200 336 344 292" stroke="rgba(255,255,255,0.2)" strokeWidth={3} fill="none" />
        <path d="M66 334 Q200 380 334 334" stroke="rgba(0,0,0,0.25)" strokeWidth={4} fill="none" />
        <path d={tail} fill={colors.scarf} />
        <path d={tail} fill={`url(#${uid}-knit)`} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={275 + i * 8 + scarfWave(2)} y={432 - i * 1.5} width={4} height={14} rx={2} fill={colors.scarf} />
        ))}
      </g>
    </svg>
  );
}
