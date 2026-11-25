import { loadFont as loadGaegu } from "@remotion/google-fonts/Gaegu";
import { loadFont as loadPatrick } from "@remotion/google-fonts/PatrickHand";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadKalam } from "@remotion/google-fonts/Kalam";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { body, display } from "../brand";

// A look is the whole art direction of one reel: world, line, cast colours, type, captions.
// Every visual (scenes, infographics, captions) is drawn through the reel's look so a video is one piece.

const gaegu = loadGaegu("normal", { weights: ["700"], subsets: ["latin"] }).fontFamily;
const patrick = loadPatrick("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const caveat = loadCaveat("normal", { weights: ["700"], subsets: ["latin"] }).fontFamily;
const kalam = loadKalam("normal", { weights: ["700"], subsets: ["latin"] }).fontFamily;
const grotesk = loadSpaceGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;
const fredoka = loadFredoka("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily;

export type LookId = "brand" | "doodle" | "paper" | "lofi" | "blueprint" | "cosmic" | "paper-blueprint" | "cinematic";

export type Cast = {
  /** outline colour; "" = no outline */
  line: string;
  lineW: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  /** draw people as dark silhouettes with no face (lo-fi) */
  silhouette: boolean;
  /** hair style */
  hairStyle: "messy" | "bald" | "none" | "short";
};

export type Look = {
  id: LookId;
  label: string;
  /** light world (dark ink on paper) or dark world (light ink) */
  light: boolean;
  /** hand-drawn line boil on everything */
  boil: boolean;
  bg: string;
  ink: string;
  /** ground behind non-scene beats */
  paper: string;
  accent: string;
  accent2: string;
  warm: string;
  /** card / panel fill for infographics */
  panel: string;
  font: string;
  bodyFont: string;
  /** title weight */
  weight: number;
  cast: Cast;
  /** set palette */
  wall: string;
  floor: string;
  wood: string;
  sky: [string, string];
  night: boolean;
};

export const LOOKS = {
  brand: {
    id: "brand",
    label: "AMX brand motion",
    light: false,
    boil: false,
    bg: "#0B1FA8",
    ink: "#FFFFFF",
    paper: "#061055",
    accent: "#93A6FF",
    accent2: "#1330E0",
    warm: "#FFD58A",
    panel: "rgba(255,255,255,0.08)",
    font: display,
    bodyFont: body,
    weight: 800,
    cast: { line: "", lineW: 0, skin: "#F2C9A8", hair: "#2A1D16", shirt: "#93A6FF", pants: "#1B2A6B", shoes: "#0B0F2A", silhouette: false, hairStyle: "short" },
    wall: "#1330E0",
    floor: "#0B1FA8",
    wood: "#2B3FC9",
    sky: ["#3A57F0", "#93A6FF"],
    night: false,
  },
  doodle: {
    id: "doodle",
    label: "Hand-drawn doodle",
    light: true,
    boil: true,
    bg: "#F7F3E8",
    ink: "#1C1C1C",
    paper: "#F7F3E8",
    accent: "#E8553D",
    accent2: "#3FA0D8",
    warm: "#F6C744",
    panel: "#FFFFFF",
    font: gaegu,
    bodyFont: patrick,
    weight: 700,
    cast: { line: "#1C1C1C", lineW: 5, skin: "#FFFFFF", hair: "#6B4226", shirt: "#FFFFFF", pants: "#4A5A7A", shoes: "#1C1C1C", silhouette: false, hairStyle: "messy" },
    wall: "#FBF6EA",
    floor: "#D9D2C3",
    wood: "#C9874F",
    sky: ["#A9DDF3", "#E6F5FB"],
    night: false,
  },
  paper: {
    id: "paper",
    label: "Cream paper cartoon",
    light: true,
    boil: true,
    bg: "#EFE5CC",
    ink: "#2B2824",
    paper: "#EFE5CC",
    accent: "#C8553D",
    accent2: "#5E8C8A",
    warm: "#E2A33B",
    panel: "#F8F1DF",
    font: caveat,
    bodyFont: kalam,
    weight: 700,
    cast: { line: "#2B2824", lineW: 4, skin: "#F6F1E6", hair: "#2B2824", shirt: "#5E8C8A", pants: "#4E463C", shoes: "#2B2824", silhouette: false, hairStyle: "bald" },
    wall: "#E9DDBF",
    floor: "#D8C8A4",
    wood: "#B98A5A",
    sky: ["#CFE3E0", "#EFE5CC"],
    night: false,
  },
  lofi: {
    id: "lofi",
    label: "Lo-fi night",
    light: false,
    boil: false,
    bg: "#0F1026",
    ink: "#F3EEFF",
    paper: "#14132E",
    accent: "#FFB46B",
    accent2: "#8C9BFF",
    warm: "#FFCF85",
    panel: "rgba(255,255,255,0.06)",
    font: grotesk,
    bodyFont: grotesk,
    weight: 700,
    cast: { line: "", lineW: 0, skin: "#07070D", hair: "#07070D", shirt: "#2E5470", pants: "#141A2E", shoes: "#07070D", silhouette: true, hairStyle: "none" },
    wall: "#1C1A3A",
    floor: "#121127",
    wood: "#2A2340",
    sky: ["#2B2A63", "#F08A5D"],
    night: true,
  },
  blueprint: {
    id: "blueprint",
    label: "3D blueprint explainer",
    light: false,
    boil: false,
    bg: "#0C3A8F",
    ink: "#EAF2FF",
    paper: "#0A2F75",
    accent: "#FF8A3D",
    accent2: "#7FB2FF",
    warm: "#FFB066",
    panel: "rgba(234,242,255,0.07)",
    font: grotesk,
    bodyFont: grotesk,
    weight: 700,
    cast: { line: "#EAF2FF", lineW: 4, skin: "#0C3A8F", hair: "#EAF2FF", shirt: "#0C3A8F", pants: "#0C3A8F", shoes: "#EAF2FF", silhouette: false, hairStyle: "short" },
    wall: "#0C3A8F",
    floor: "#0A2F75",
    wood: "#0A2F75",
    sky: ["#0C3A8F", "#1450B8"],
    night: false,
  },
  cosmic: {
    id: "cosmic",
    label: "Cosmic isometric",
    light: false,
    boil: false,
    bg: "#1B1342",
    ink: "#FFFFFF",
    paper: "#150F36",
    accent: "#FFD15C",
    accent2: "#FF5FA2",
    warm: "#FFD15C",
    panel: "rgba(255,255,255,0.07)",
    font: fredoka,
    bodyFont: fredoka,
    weight: 700,
    cast: { line: "", lineW: 0, skin: "#F4C7A1", hair: "#3A2A6E", shirt: "#6A4CFF", pants: "#2A1F66", shoes: "#140E33", silhouette: false, hairStyle: "short" },
    wall: "#2A1F66",
    floor: "#211852",
    wood: "#3A2D8A",
    sky: ["#1B1342", "#4A2FA8"],
    night: true,
  },
} as Record<LookId, Look>;

// Paper cartoon story that cuts to 3D blueprint explainers: everything is paper, except `object` beats,
// which open onto the blueprint world (see Beats.tsx).
LOOKS["paper-blueprint"] = { ...LOOKS.paper, id: "paper-blueprint", label: "Paper cartoon × 3D blueprint" };

// Photoreal, Zack D. Films-style: every beat is one realistic shot (free Flux frame) with a real camera move,
// a film grade, big captions with the key word in safety yellow, on-image callouts and synthesized SFX.
LOOKS.cinematic = {
  ...LOOKS.brand,
  id: "cinematic",
  label: "Cinematic photoreal",
  bg: "#050505",
  ink: "#FFFFFF",
  paper: "#050505",
  accent: "#FFC400",
  accent2: "#FF4D1A",
  warm: "#FFC400",
  panel: "rgba(0,0,0,0.55)",
  font: display,
  bodyFont: body,
  weight: 800,
};

/** The look an `object` beat is drawn in, inside a reel of `look`. */
export const objectLook = (look: Look): Look => (look.id === "paper-blueprint" ? LOOKS.blueprint : look);

export const lookById = (id: string | undefined): Look => LOOKS[(id as LookId) || "brand"] ?? LOOKS.brand;
