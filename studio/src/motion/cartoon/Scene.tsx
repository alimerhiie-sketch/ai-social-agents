import React from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { withAlpha } from "../../brand";
import type { Beat } from "../../types";
import type { Look } from "../looks";
import { Mascot, type MascotColors } from "../Mascot";
import { pr } from "../theme";
import { Person, sitsDown, type Action } from "./Person";
import { Prop, PROP_KINDS, type PropKind } from "./Props";

// A staged cartoon moment: a set (room / park / stage) with layered depth and ambient life, the cast, props and
// a speech bubble, framed by a moving camera. Everything is drawn through the reel's look.

export type SetId = "desk" | "park" | "stage" | "city";

const W = 1080;
const H = 1920;
const PS = 520 / 300; // person scale (rig units → px)

const ln = (look: Look) => ({ stroke: look.cast.line || "none", strokeWidth: look.cast.lineW || 0, strokeLinejoin: "round" as const });

function Sky({ look, f, top, height }: { look: Look; f: number; top: number; height: number }) {
  const [a, b] = look.sky;
  return (
    <g>
      <defs>
        <linearGradient id={`sky-${look.id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      <rect x={0} y={top} width={W} height={height} fill={`url(#sky-${look.id})`} />
      {look.night
        ? Array.from({ length: 40 }, (_, i) => {
            const r = (k: string) => random(`st${i}${k}`);
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(f / (10 + r("t") * 20) + i));
            return <circle key={i} cx={r("x") * W} cy={top + r("y") * height * 0.6} r={1.5 + r("s") * 2.5} fill="#FFFFFF" opacity={tw} />;
          })
        : Array.from({ length: 4 }, (_, i) => {
            const r = (k: string) => random(`cl${i}${k}`);
            const x = ((r("x") * (W + 400) + f * (0.6 + r("v") * 0.6)) % (W + 400)) - 200;
            const y = top + 60 + r("y") * height * 0.35;
            const s = 0.7 + r("s") * 0.6;
            return (
              <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
                <path d="M-90 20 Q-100 -20 -55 -24 Q-40 -60 0 -50 Q40 -70 60 -30 Q100 -30 95 20 Z" fill="#FFFFFF" {...ln(look)} />
              </g>
            );
          })}
    </g>
  );
}

function Skyline({ look, f, base, top }: { look: Look; f: number; base: number; top: number }) {
  const bs = Array.from({ length: 14 }, (_, i) => {
    const r = (k: string) => random(`bd${i}${k}`);
    return { x: i * 82 - 20, w: 70 + r("w") * 40, h: 120 + r("h") * (base - top - 160) };
  });
  return (
    <g>
      {bs.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={base - b.h} width={b.w} height={b.h} fill={look.night ? "#1A1838" : look.light ? "#BFCAD6" : withAlpha(look.ink, 0.15)} {...(look.light ? ln(look) : {})} />
          {look.night &&
            Array.from({ length: Math.floor(b.h / 40) * 2 }, (_, j) => {
              const lit = random(`w${i}-${j}`) > 0.55 !== (Math.floor(f / 60 + i + j) % 7 === 0);
              return lit ? <rect key={j} x={b.x + 12 + (j % 2) * (b.w / 2 - 6)} y={base - b.h + 16 + Math.floor(j / 2) * 40} width={14} height={18} fill="#FFC979" opacity={0.85} /> : null;
            })}
        </g>
      ))}
    </g>
  );
}

function Birds({ f, color }: { f: number; color: string }) {
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const x = ((f * (3 + i) + i * 300) % (W + 200)) - 100;
        const y = 380 + i * 60 + Math.sin(f / 10 + i) * 14;
        const flap = Math.sin(f / 2.5 + i) * 12;
        return <path key={i} d={`M${x - 22} ${y - flap} Q${x - 10} ${y - 8} ${x} ${y} Q${x + 10} ${y - 8} ${x + 22} ${y - flap}`} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" />;
      })}
    </g>
  );
}

type Layout = { back: React.ReactNode; front: React.ReactNode; person: { x: number; top: number }; slots: Record<"left" | "right" | "wallL" | "wallR", [number, number]> };

function deskSet(look: Look, f: number): Layout {
  const deskTop = 1120;
  const lamp = look.night;
  return {
    back: (
      <>
        <rect x={0} y={0} width={W} height={H} fill={look.wall} />
        {/* window */}
        <g>
          <rect x={290} y={250} width={500} height={600} fill={look.sky[0]} />
          <svg x={290} y={250} width={500} height={600} viewBox={`290 250 500 600`} overflow="hidden">
            <Sky look={look} f={f} top={250} height={600} />
            <Skyline look={look} f={f} base={850} top={430} />
          </svg>
          <rect x={290} y={250} width={500} height={600} fill="none" stroke={look.cast.line || look.wood} strokeWidth={look.cast.lineW ? look.cast.lineW + 10 : 16} />
          <line x1={540} x2={540} y1={250} y2={850} stroke={look.cast.line || look.wood} strokeWidth={look.cast.lineW + 6 || 10} />
          <line x1={290} x2={790} y1={540} y2={540} stroke={look.cast.line || look.wood} strokeWidth={look.cast.lineW + 6 || 10} />
          <rect x={270} y={850} width={540} height={26} fill={look.wood} {...ln(look)} />
        </g>
        {/* shelf */}
        <rect x={60} y={420} width={170} height={16} fill={look.wood} {...ln(look)} />
        {lamp && (
          <g>
            <line x1={860} x2={860} y1={0} y2={300} stroke="#0A0A14" strokeWidth={6} />
            <path d="M800 300 L920 300 L890 250 L830 250 Z" fill="#0A0A14" />
            <path d="M800 300 L920 300 L1080 1200 L640 1200 Z" fill={look.accent} opacity={0.08 + Math.sin(f / 30) * 0.01} />
            <ellipse cx={860} cy={302} rx={60} ry={14} fill={look.warm} opacity={0.9} style={{ filter: "blur(6px)" }} />
          </g>
        )}
      </>
    ),
    front: (
      <>
        <rect x={0} y={deskTop} width={W} height={36} fill={look.wood} {...ln(look)} />
        <rect x={40} y={deskTop + 36} width={W - 80} height={300} fill={look.night ? "#1E1A34" : look.wood} {...ln(look)} />
        <rect x={150} y={deskTop + 110} width={260} height={70} rx={10} fill="none" stroke={look.cast.line || "rgba(255,255,255,0.15)"} strokeWidth={look.cast.lineW || 3} />
        <rect x={670} y={deskTop + 110} width={260} height={70} rx={10} fill="none" stroke={look.cast.line || "rgba(255,255,255,0.15)"} strokeWidth={look.cast.lineW || 3} />
        <rect x={0} y={deskTop + 336} width={W} height={H} fill={look.floor} />
      </>
    ),
    person: { x: W / 2, top: deskTop + 10 - 338 * PS },
    slots: { left: [190, deskTop - 60], right: [890, deskTop - 60], wallL: [205, 330], wallR: [885, 520] },
  };
}

function parkSet(look: Look, f: number): Layout {
  const ground = 1180;
  const sway = Math.sin(f / 24) * 3;
  return {
    back: (
      <>
        <Sky look={look} f={f} top={0} height={ground} />
        {!look.night && <Birds f={f} color={look.cast.line || "#333"} />}
        <path d={`M0 ${ground - 120} Q270 ${ground - 220} 540 ${ground - 140} Q810 ${ground - 70} 1080 ${ground - 170} L1080 ${ground} L0 ${ground} Z`} fill={look.night ? "#1D2A3A" : "#A8D58F"} {...ln(look)} />
        {/* tree */}
        <g transform={`rotate(${sway * 0.3} 170 ${ground})`}>
          <rect x={150} y={ground - 330} width={44} height={330} fill={look.night ? "#1A1420" : "#8A5A35"} {...ln(look)} />
          <g transform={`rotate(${sway} 172 ${ground - 330})`}>
            <circle cx={172} cy={ground - 420} r={140} fill={look.night ? "#162A2A" : "#5FAE5A"} {...ln(look)} />
            <circle cx={90} cy={ground - 360} r={80} fill={look.night ? "#162A2A" : "#5FAE5A"} {...ln(look)} />
            <circle cx={260} cy={ground - 360} r={80} fill={look.night ? "#162A2A" : "#5FAE5A"} {...ln(look)} />
          </g>
        </g>
        <rect x={0} y={ground} width={W} height={150} fill={look.night ? "#2A2838" : "#D7D2C6"} {...ln(look)} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={i * 130} x2={i * 130} y1={ground} y2={ground + 150} stroke={look.cast.line || "rgba(0,0,0,0.15)"} strokeWidth={look.cast.lineW || 2} />
        ))}
        <rect x={0} y={ground + 150} width={W} height={H} fill={look.night ? "#18161F" : "#55585E"} />
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={`r${i}`} x={i * 200 + 40 - ((f * 2) % 200)} y={ground + 290} width={110} height={14} fill="#FFFFFF" opacity={0.85} />
        ))}
        {/* bench back */}
        <rect x={290} y={ground - 190} width={500} height={26} rx={6} fill={look.wood} {...ln(look)} />
        <rect x={290} y={ground - 150} width={500} height={26} rx={6} fill={look.wood} {...ln(look)} />
        {/* bus stop sign */}
        <rect x={930} y={ground - 420} width={14} height={420} fill="#777" {...ln(look)} />
        <rect x={880} y={ground - 470} width={114} height={70} rx={8} fill="#FFD84A" {...ln(look)} />
      </>
    ),
    front: (
      <>
        <rect x={270} y={ground - 40} width={540} height={30} rx={6} fill={look.wood} {...ln(look)} />
        <rect x={300} y={ground - 10} width={18} height={110} fill="#555" {...ln(look)} />
        <rect x={762} y={ground - 10} width={18} height={110} fill="#555" {...ln(look)} />
      </>
    ),
    person: { x: W / 2, top: ground - 30 - 338 * PS },
    slots: { left: [150, ground - 40], right: [930, ground - 520], wallL: [540, 300], wallR: [930, ground - 520] },
  };
}

function stageSet(look: Look, f: number): Layout {
  const floor = 1300;
  return {
    back: (
      <>
        <rect x={0} y={0} width={W} height={H} fill={look.paper} />
        <ellipse cx={540} cy={floor + 10} rx={420} ry={60} fill={look.light ? "rgba(0,0,0,0.08)" : withAlpha(look.accent2, 0.15)} />
        {!look.light && <path d={`M420 0 L660 0 L960 ${floor} L120 ${floor} Z`} fill={look.accent2} opacity={0.06 + Math.sin(f / 25) * 0.01} />}
        <line x1={60} x2={1020} y1={floor} y2={floor} stroke={look.cast.line || withAlpha(look.ink, 0.25)} strokeWidth={look.cast.lineW || 3} />
      </>
    ),
    front: null,
    person: { x: W / 2, top: floor - 566 * PS * 0.92 },
    slots: { left: [190, 760], right: [890, 760], wallL: [190, 460], wallR: [890, 460] },
  };
}

function citySet(look: Look, f: number): Layout {
  const ground = 1250;
  return {
    back: (
      <>
        <Sky look={look} f={f} top={0} height={ground} />
        <Skyline look={look} f={f} base={ground} top={500} />
        <rect x={0} y={ground} width={W} height={H} fill={look.floor} />
        <line x1={0} x2={W} y1={ground} y2={ground} stroke={look.cast.line || withAlpha(look.ink, 0.2)} strokeWidth={look.cast.lineW || 3} />
      </>
    ),
    front: null,
    person: { x: W / 2, top: ground + 40 - 566 * PS * 0.92 },
    slots: { left: [190, 760], right: [890, 760], wallL: [190, 460], wallR: [890, 460] },
  };
}

const SETS: Record<SetId, (look: Look, f: number) => Layout> = { desk: deskSet, park: parkSet, stage: stageSet, city: citySet };

/** Where each prop kind wants to sit by default, per set. */
function slotFor(kind: PropKind, i: number, set: SetId): "left" | "right" | "wallL" | "wallR" | "hand" | "desk" {
  if (kind === "phone") return "hand";
  if (kind === "laptop") return set === "desk" ? "desk" : i % 2 ? "right" : "left";
  if (set === "desk") {
    if (kind === "clock" || kind === "calendar" || kind === "sign" || kind === "chart") return i % 2 ? "wallR" : "wallL";
    return i % 2 ? "right" : "left";
  }
  if (set === "park" && kind === "sign") return "wallR";
  return i % 2 ? "right" : "left";
}

const MASCOT_POSE: Partial<Record<Action, "idle" | "wave" | "point" | "think" | "shrug" | "cheer" | "hold" | "surprised">> = {
  wave: "wave",
  point: "point",
  think: "think",
  shrug: "shrug",
  shock: "surprised",
  happy: "cheer",
  present: "hold",
};

export function SceneBeat({ beat, look, d, seed, mascot }: { beat: Beat; look: Look; d: number; seed: number; mascot: MascotColors }) {
  const f = useCurrentFrame();
  const set: SetId = (["desk", "park", "stage", "city"] as const).includes(beat.set as SetId) ? (beat.set as SetId) : "desk";
  const lay = SETS[set](look, f);
  let action: Action = (beat.action as Action) || "stand";
  if (set === "desk" && !sitsDown(action) && !["think", "shock", "happy", "shrug", "wave", "point"].includes(action)) action = "sit";
  const sitting = sitsDown(action);
  const personW = 520;
  const personTop = set === "stage" || set === "city" ? lay.person.top - (sitting ? -80 : 0) : lay.person.top;
  const props = (beat.props ?? []).filter((p) => PROP_KINDS.includes(p.kind as PropKind)).slice(0, 3);
  const mascotOnly = beat.who === "mascot";

  // camera: wide or close on the face, always drifting
  const close = beat.shot === "close";
  const headY = personTop + 108 * PS;
  const push = 1 + (f / Math.max(1, d)) * 0.05;
  const scale = (close ? (mascotOnly ? 1.3 : 1.6) : 1.12) * push;
  const ox = 540 + Math.sin(f / 40 + seed) * 12;
  const oy = close ? headY + 60 : headY + 260;
  const drift = Math.sin(f / 33) * 6;

  const bubble = pr(f, 6, 12);
  const deskHas = props.some((p) => p.kind === "laptop") || (set === "desk" && action === "type");

  return (
    <AbsoluteFill style={{ background: look.paper, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translate(${drift}px, 0) scale(${scale})`, transformOrigin: `${ox}px ${oy}px` }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, transform: `translateX(${-drift * 0.6}px)` }}>
          {lay.back}
        </svg>

        {/* cast */}
        <div style={{ position: "absolute", left: lay.person.x - personW / 2, top: personTop, transform: `translateY(${(1 - pr(f, 0, 14)) * 60}px)` }}>
          {mascotOnly ? (
            <div style={{ marginTop: 120 }}>
              <Mascot pose={MASCOT_POSE[action] ?? (beat.pose as never) ?? "idle"} size={personW} colors={mascot} seed={seed} />
            </div>
          ) : (
            <Person action={action} cast={look.cast} width={personW} seed={seed} />
          )}
        </div>

        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
          {lay.front}
          {set === "desk" && deskHas && (
            <g transform={`translate(540 ${1120})`}>
              <Prop kind="laptop" look={look} f={f} label="" seed={seed} />
            </g>
          )}
          {props.map((p, i) => {
            if (p.kind === "laptop" && set === "desk") return null;
            const slot = slotFor(p.kind as PropKind, i, set);
            let x = 540;
            let y = 900;
            if (slot === "hand") {
              x = 540;
              y = personTop + 270 * PS;
            } else if (slot !== "desk") [x, y] = lay.slots[slot];
            const s = pr(f, 4 + i * 4, 12);
            const sc = slot === "hand" ? 0.9 : p.kind === "sign" && set === "park" ? 0.8 : 1.15;
            if (p.kind === "sign") {
              // keep the whole sign in frame
              const half = (Math.max(200, Math.min(420, (p.label || "").length * 30 + 60)) / 2) * sc;
              if (set === "stage" || set === "city") [x, y] = [540, 330];
              x = Math.max(half + 40, Math.min(W - half - 40, x));
            }
            return (
              <g key={i} transform={`translate(${x} ${y + (1 - s) * 40}) scale(${sc * (0.85 + s * 0.15)})`} opacity={s}>
                <Prop kind={p.kind as PropKind} look={look} f={f - 4 - i * 4} label={p.label} seed={seed + i} />
              </g>
            );
          })}
        </svg>

        {beat.text && (
          <div style={{ position: "absolute", left: 0, right: 0, top: Math.max(260, personTop - 230), display: "flex", justifyContent: "center", opacity: bubble, transform: `translateY(${(1 - bubble) * 24 + Math.sin(f / 15) * 4}px) scale(${0.9 + 0.1 * bubble})` }}>
            <div
              style={{
                position: "relative",
                maxWidth: 760,
                padding: "26px 40px",
                borderRadius: 36,
                background: "#FFFFFF",
                border: look.cast.line ? `${look.cast.lineW}px solid ${look.cast.line}` : "none",
                fontFamily: look.font,
                fontWeight: look.weight,
                fontSize: beat.text.length > 26 ? 52 : 64,
                lineHeight: 1.05,
                color: "#1C1C1C",
                textAlign: "center",
                boxShadow: look.light ? "none" : "0 20px 60px rgba(0,0,0,0.45)",
              }}
            >
              {beat.text.replace(/\*/g, "")}
              <div style={{ position: "absolute", left: "50%", bottom: -20, width: 36, height: 36, background: "#FFFFFF", transform: "translateX(-50%) rotate(45deg)", borderRight: look.cast.line ? `${look.cast.lineW}px solid ${look.cast.line}` : "none", borderBottom: look.cast.line ? `${look.cast.lineW}px solid ${look.cast.line}` : "none" }} />
            </div>
          </div>
        )}
      </AbsoluteFill>
      {look.night && <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(5,5,15,0.55) 100%)" }} />}
    </AbsoluteFill>
  );
}
