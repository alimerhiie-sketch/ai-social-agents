import { Easing } from "remotion";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// Type system: Montserrat (the AMX lockup face) for display, Inter for reading text.
export const display = loadMontserrat("normal", { weights: ["600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const body = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

// Story type for the illustrated styles.
import { loadFont as loadCormorant } from "@remotion/google-fonts/CormorantGaramond";
import { loadFont as loadCinzel } from "@remotion/google-fonts/Cinzel";
export const serif = loadCormorant("normal", { weights: ["500", "600", "700"], subsets: ["latin"] }).fontFamily;
export const roman = loadCinzel("normal", { weights: ["500", "600", "700"], subsets: ["latin"] }).fontFamily;

// Motion system: one curve for everything that arrives, a quicker one for what leaves.
// Expo-out, no springs, no overshoot.
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

export const ENTER = 16; // frames for one element to settle
export const STAGGER = 2.5; // frames between words
export const EXIT = 9; // frames for a scene to clear

/** Safe area for 9:16 so TikTok / Reels UI never covers text. */
export const SAFE = { left: 96, right: 168, top: 300, bottom: 420 };

export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
