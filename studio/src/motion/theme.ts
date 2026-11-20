import { interpolate } from "remotion";
import { easeIn, easeOut } from "../brand";
import type { ArtStyle } from "../artStyles";
import type { Palette } from "../types";

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

export function themeFor(palette: Palette, style: ArtStyle | null): Theme {
  return {
    base: mix(palette.deep, "#000000", 0.55),
    field: palette.field,
    deep: palette.deep,
    accent: palette.soft,
    warm: style?.glow || "#FFD58A",
    ink: "#FFFFFF",
  };
}

/** eased 0→1 progress of something starting at `start` (local frames) */
export const pr = (f: number, start: number, len: number) =>
  interpolate(f, [start, start + len], [0, 1], { easing: easeOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const prIn = (f: number, start: number, len: number) =>
  interpolate(f, [start, start + len], [0, 1], { easing: easeIn, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

export const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
