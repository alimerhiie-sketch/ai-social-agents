import { interpolate } from "remotion";
import { easeIn, easeOut } from "../brand";
import type { ArtStyle } from "../artStyles";
import type { Palette } from "../types";
import { body, display } from "../brand";
import type { Look } from "./looks";

export type Theme = {
  /** darkest ground */
  base: string;
  /** brand field colour */
  field: string;
  deep: string;
  /** cool accent (brand periwinkle) */
  accent: string;
  /** warm accent from the art style: emphasis only, used sparingly */
  warm: string;
  ink: string;
  font: string;
  bodyFont: string;
  weight: number;
  /** dark ink on a light world */
  light: boolean;
  panel: string;
  /** shadow colour for depth on this world */
  shadow: string;
};

const hex = (h: string) => {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** a→b by t (0–1), hex in, hex out */
export function mix(a: string, b: string, t: number) {
  const A = hex(a);
  const B = hex(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function themeFor(palette: Palette, style: ArtStyle | null, look?: Look): Theme {
  if (look && look.id !== "brand") {
    return {
      base: look.paper,
      field: look.accent2,
      deep: look.bg,
      accent: look.light ? look.accent2 : look.accent2,
      warm: look.accent,
      ink: look.ink,
      font: look.font,
      bodyFont: look.bodyFont,
      weight: look.weight,
      light: look.light,
      panel: look.panel,
      shadow: look.light ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.45)",
    };
  }
  return {
    base: mix(palette.deep, "#000000", 0.55),
    field: palette.field,
    deep: palette.deep,
    accent: palette.soft,
    warm: style?.glow || "#FFD58A",
    ink: "#FFFFFF",
    font: display,
    bodyFont: body,
    weight: 800,
    light: false,
    panel: "rgba(255,255,255,0.08)",
    shadow: "rgba(0,0,0,0.4)",
  };
}

/** eased 0→1 progress of something starting at `start` (local frames) */
export const pr = (f: number, start: number, len: number) =>
  interpolate(f, [start, start + len], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const prIn = (f: number, start: number, len: number) =>
  interpolate(f, [start, start + len], [0, 1], { easing: easeIn, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
