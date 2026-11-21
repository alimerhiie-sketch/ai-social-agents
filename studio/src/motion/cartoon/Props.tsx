import React from "react";
import { random } from "remotion";
import type { Look } from "../looks";
import { Mascot, PIP } from "../Mascot";
import { pr } from "../theme";

// Animated props, drawn in SVG through the look (outline + fills). Each is centred on (0,0), roughly 200 units tall.

export type PropKind =
  | "calendar"
  | "clock"
  | "cups"
  | "mug"
  | "plant"
  | "monitor"
  | "phone"
  | "sign"
  | "chart"
  | "money"
  | "lightbulb"
  | "papers"
  | "books"
  | "robot"
  | "laptop";

export const PROP_KINDS: PropKind[] = ["calendar", "clock", "cups", "mug", "plant", "monitor", "phone", "sign", "chart", "money", "lightbulb", "papers", "books", "robot", "laptop"];

type P = { look: Look; f: number; label: string; seed: number };

const stroke = (look: Look) => ({ stroke: look.cast.line || (look.light ? "#222" : "rgba(255,255,255,0.0)"), strokeWidth: look.cast.lineW || 0, strokeLinejoin: "round" as const });
const text = (look: Look, size: number, color?: string): React.SVGProps<SVGTextElement> => ({
  fontFamily: look.font,
  fontWeight: look.weight,
  fontSize: size,
  textAnchor: "middle",
  fill: color ?? (look.light ? look.ink : "#1C1C1C"),
});

function Calendar({ look, f, label }: P) {
  // pages tear away until the label shows
  const n = parseInt(label.replace(/\D/g, ""), 10);
  const target = Number.isFinite(n) ? n : 0;
  const flips = 6;
  const step = Math.min(flips, Math.floor(f / 4));
  const shown = label && !Number.isFinite(n) ? label : String(Math.max(0, target - (flips - step)));
  const tear = (f % 4) / 4;
  const s = stroke(look);
  return (
    <g>
      <rect x={-80} y={-90} width={160} height={180} rx={10} fill="#FFFFFF" {...s} />
      <rect x={-80} y={-90} width={160} height={46} rx={10} fill={look.accent} {...s} />
      <text {...text(look, 26, "#FFFFFF")} y={-58}>DAY</text>
      <text {...text(look, 84)} y={50}>{shown}</text>
      {step < flips && (
        <g transform={`translate(0 ${-44}) rotate(${-tear * 70} -80 0)`} opacity={1 - tear}>
          <rect x={-80} y={0} width={160} height={134} fill="#FFFFFF" {...s} />
        </g>
      )}
      <circle cx={-40} cy={-90} r={7} fill={look.ink} />
      <circle cx={40} cy={-90} r={7} fill={look.ink} />
    </g>
  );
}

function Clock({ look, f, label }: P) {
  const t = label || "22:00";
  const [a, b] = t.includes(":") ? t.split(":") : [t, ""];
  const flip = (f % 30) / 30;
  const s = stroke(look);
  const card = (x: number, v: string) => (
    <g transform={`translate(${x} 0)`}>
      <rect x={-58} y={-70} width={116} height={140} rx={14} fill="#F4F1EA" {...s} />
      <line x1={-58} x2={58} y1={0} y2={0} stroke="rgba(0,0,0,0.25)" strokeWidth={3} />
      <text {...text(look, 92, "#1C1C1C")} y={32} fontFamily={look.font}>
        {v}
      </text>
      {flip < 0.15 && <rect x={-58} y={-70} width={116} height={70 * (1 - flip / 0.15)} rx={14} fill="#E8E4DA" />}
    </g>
  );
  return (
    <g>
      <rect x={-140} y={-86} width={280} height={172} rx={20} fill={look.light ? look.ink : "#2A2840"} {...s} />
      {card(-62, a)}
      {b && card(62, b)}
    </g>
  );
}

function Cups({ look, f, label }: P) {
  const n = Math.max(3, Math.min(9, parseInt(label, 10) || 7));
  const shown = Math.min(n, 1 + Math.floor(f / 5));
  const s = stroke(look);
  return (
    <g>
      {Array.from({ length: shown }, (_, i) => {
        const p = pr(f, i * 5, 6);
        return (
          <g key={i} transform={`translate(${Math.sin(i * 1.7) * 6} ${80 - i * 34 - (1 - p) * 60})`} opacity={p}>
            <path d="M-34 -16 L34 -16 L28 18 L-28 18 Z" fill={i % 2 ? "#FFFFFF" : look.warm} {...s} />
            <rect x={-38} y={-22} width={76} height={8} rx={4} fill="#FFFFFF" {...s} />
          </g>
        );
      })}
    </g>
  );
}

function Steam({ f, x, y, color }: { f: number; x: number; y: number; color: string }) {
  return (
    <g opacity={0.7}>
      {[0, 1, 2].map((i) => {
        const ph = ((f + i * 12) % 36) / 36;
        return <path key={i} d={`M${x + (i - 1) * 16} ${y - ph * 60} q10 -14 0 -28 q-10 -14 0 -28`} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round" opacity={1 - ph} />;
      })}
    </g>
  );
}

function Mug({ look, f }: P) {
  const s = stroke(look);
  return (
    <g>
      <Steam f={f} x={0} y={-50} color={look.light ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.5)"} />
      <path d="M44 -20 q36 0 36 26 q0 26 -36 26" fill="none" stroke={look.cast.line || look.accent} strokeWidth={10} />
      <rect x={-48} y={-46} width={96} height={100} rx={14} fill={look.accent} {...s} />
    </g>
  );
}

function Plant({ look, f }: P) {
  const s = stroke(look);
  const sway = Math.sin(f / 18) * 4;
  return (
    <g>
      {[-40, -14, 14, 40].map((a, i) => (
        <path key={i} d={`M0 -30 Q${a * 0.6 + sway} -90 ${a * 1.4 + sway * 1.5} -150`} stroke={look.cast.line || "#2F6B3F"} strokeWidth={4} fill="none" />
      ))}
      {[-40, -14, 14, 40].map((a, i) => (
        <ellipse key={`l${i}`} cx={a * 1.4 + sway * 1.5} cy={-140} rx={22} ry={40} fill={look.id === "lofi" ? "#1F3A33" : "#6FB36A"} transform={`rotate(${a * 0.8 + sway} ${a * 1.4} -140)`} {...s} />
      ))}
      <path d="M-50 -30 L50 -30 L38 70 L-38 70 Z" fill={look.wood} {...s} />
    </g>
  );
}

function Monitor({ look, f }: P) {
  const s = stroke(look);
  const lines = [0.8, 0.55, 0.7, 0.4];
  return (
    <g>
      <rect x={-14} y={70} width={28} height={50} fill={look.light ? "#999" : "#333"} {...s} />
      <rect x={-70} y={116} width={140} height={14} rx={6} fill={look.light ? "#888" : "#333"} {...s} />
      <rect x={-150} y={-110} width={300} height={190} rx={14} fill={look.light ? "#2B2B2B" : "#0B0B14"} {...s} />
      <rect x={-136} y={-96} width={272} height={162} rx={6} fill={look.id === "lofi" ? "#2C3A6E" : "#DDEFFF"} />
      {lines.map((w, i) => (
        <rect key={i} x={-120} y={-80 + i * 34} width={240 * w * Math.min(1, (f - i * 6) / 14)} height={14} rx={7} fill={i === 0 ? look.accent : look.id === "lofi" ? "#8C9BFF" : "#7FA7D6"} />
      ))}
      {look.id === "lofi" && <rect x={-150} y={-110} width={300} height={190} rx={14} fill="none" stroke="#8C9BFF" strokeOpacity={0.25} strokeWidth={30} style={{ filter: "blur(18px)" }} />}
    </g>
  );
}

function Phone({ look, f }: P) {
  const s = stroke(look);
  const glow = 0.6 + Math.sin(f / 6) * 0.1;
  return (
    <g>
      <rect x={-38} y={-70} width={76} height={140} rx={14} fill="#1C1C1C" {...s} />
      <rect x={-30} y={-60} width={60} height={120} rx={8} fill={look.accent2} opacity={glow} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={-22} y={-46 + i * 26} width={44 * (0.6 + 0.4 * ((i + Math.floor(f / 8)) % 2))} height={12} rx={6} fill="#FFFFFF" opacity={0.85} />
      ))}
    </g>
  );
}

function Sign({ look, f, label }: P) {
  const s = stroke(look);
  const swing = Math.sin(f / 20) * 2;
  const w = Math.max(200, Math.min(420, (label || "SIGN").length * 30 + 60));
  return (
    <g transform={`rotate(${swing} 0 -60)`}>
      <rect x={-w / 2} y={-60} width={w} height={84} rx={8} fill="#FFFFFF" {...s} />
      <text {...text(look, 44, look.light ? look.ink : "#1C1C1C")} y={-4}>
        {(label || "").toUpperCase()}
      </text>
    </g>
  );
}

function Chart({ look, f, label }: P) {
  const s = stroke(look);
  const down = /down|drop|fall|less|low/i.test(label);
  const pts = Array.from({ length: 7 }, (_, i) => {
    const r = random(`ch${i}`) * 30;
    const trend = down ? i * 20 : -i * 22;
    return [-130 + i * 44, 20 + trend + r - (down ? 40 : -40)];
  });
  const p = pr(f, 4, 26);
  const n = Math.max(2, Math.ceil(p * pts.length));
  const d = pts.slice(0, n).map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join(" ");
  const last = pts[n - 1];
  return (
    <g>
      <rect x={-170} y={-140} width={340} height={260} rx={14} fill="#FFFFFF" {...s} />
      <path d="M-140 -110 L-140 90 L150 90" stroke="#BBB" strokeWidth={4} fill="none" />
      <path d={d} stroke={down ? look.accent : "#3BA55C"} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={11} fill={down ? look.accent : "#3BA55C"} />
      {label && (
        <text {...text(look, 36, "#1C1C1C")} y={-100} x={0}>
          {label}
        </text>
      )}
    </g>
  );
}

function Money({ look, f, label }: P) {
  const s = stroke(look);
  return (
    <g>
      {Array.from({ length: 5 }, (_, i) => {
        const ph = ((f + i * 9) % 45) / 45;
        const x = Math.sin(i * 2.1 + f / 12) * 60;
        return (
          <g key={i} transform={`translate(${x} ${-ph * 200 + 60}) rotate(${Math.sin(f / 7 + i) * 25})`} opacity={1 - ph * 0.8}>
            <rect x={-56} y={-28} width={112} height={56} rx={6} fill="#8FD18B" {...s} />
            <circle r={16} fill="none" stroke="#2F7A3A" strokeWidth={4} />
          </g>
        );
      })}
      {label && (
        <text {...text(look, 64, look.light ? look.ink : "#FFFFFF")} y={130}>
          {label}
        </text>
      )}
    </g>
  );
}

function Lightbulb({ look, f }: P) {
  const s = stroke(look);
  const on = pr(f, 8, 6);
  return (
    <g>
      <circle r={120} fill={look.warm} opacity={on * 0.35} style={{ filter: "blur(20px)" }} />
      {on > 0.5 &&
        Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return <line key={i} x1={Math.cos(a) * 95} y1={Math.sin(a) * 95 - 10} x2={Math.cos(a) * 125} y2={Math.sin(a) * 125 - 10} stroke={look.warm} strokeWidth={8} strokeLinecap="round" />;
        })}
      <circle cy={-20} r={66} fill={on > 0.5 ? look.warm : "#FFFFFF"} {...s} />
      <rect x={-30} y={40} width={60} height={46} rx={8} fill="#BBB" {...s} />
    </g>
  );
}

function Papers({ look, f }: P) {
  const s = stroke(look);
  const n = Math.min(10, 2 + Math.floor(f / 4));
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={-90 + Math.sin(i * 3.1) * 10} y={60 - i * 16} width={180} height={24} fill="#FFFFFF" transform={`rotate(${Math.sin(i * 1.3) * 4})`} {...s} />
      ))}
    </g>
  );
}

function Books({ look }: P) {
  const s = stroke(look);
  const cols = [look.accent, look.accent2, look.warm, look.wood];
  return (
    <g>
      {cols.map((c, i) => (
        <rect key={i} x={-90 + i * 46} y={-80 + (i % 2) * 10} width={40} height={160 - (i % 2) * 10} rx={4} fill={c} {...s} />
      ))}
    </g>
  );
}

function Laptop({ look, f }: P) {
  const s = stroke(look);
  return (
    <g>
      <path d="M-150 -170 L150 -170 L160 20 L-160 20 Z" fill={look.light ? "#D9D9D9" : "#2A2A3A"} {...s} />
      <circle cy={-80} r={18} fill={look.light ? "#FFFFFF" : "#3A3A50"} opacity={0.8} />
      <rect x={-190} y={18} width={380} height={20} rx={8} fill={look.light ? "#BDBDBD" : "#1E1E2A"} {...s} />
      {look.id === "lofi" && <ellipse cx={0} cy={-200} rx={180} ry={60} fill="#8C9BFF" opacity={0.18 + Math.sin(f / 9) * 0.04} style={{ filter: "blur(24px)" }} />}
    </g>
  );
}

function Robot({ f }: P) {
  return (
    <g transform="translate(-110 -150)">
      <Mascot pose={Math.floor(f / 40) % 2 ? "wave" : "idle"} size={220} colors={PIP} seed={7} />
    </g>
  );
}

export function Prop({ kind, look, f, label, seed }: { kind: PropKind; look: Look; f: number; label: string; seed: number }) {
  const p = { look, f, label, seed };
  switch (kind) {
    case "calendar":
      return <Calendar {...p} />;
    case "clock":
      return <Clock {...p} />;
    case "cups":
      return <Cups {...p} />;
    case "mug":
      return <Mug {...p} />;
    case "plant":
      return <Plant {...p} />;
    case "monitor":
      return <Monitor {...p} />;
    case "phone":
      return <Phone {...p} />;
    case "sign":
      return <Sign {...p} />;
    case "chart":
      return <Chart {...p} />;
    case "money":
      return <Money {...p} />;
    case "lightbulb":
      return <Lightbulb {...p} />;
    case "papers":
      return <Papers {...p} />;
    case "books":
      return <Books {...p} />;
    case "robot":
      return <Robot {...p} />;
    case "laptop":
      return <Laptop {...p} />;
    default:
      return null;
  }
}
