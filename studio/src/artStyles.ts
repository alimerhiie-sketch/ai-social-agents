// The art styles an account can use. Each one is two halves:
//  - `prompt`: what the image model is told, so every scene in a video shares one hand
//  - the treatment: how Remotion brings the still to life (grade, texture, particles, transition, type)

export type Particles = "dust" | "pollen" | "petals" | "fireflies" | "embers" | "ink" | "snow" | "none";
export type Transition = "wash" | "ink" | "dissolve" | "tear" | "bloom";
export type CaptionFont = "serif" | "roman" | "sans" | "display";

export type ArtStyle = {
  id: string;
  label: string;
  prompt: string;
  /** CSS filter grade applied over the image */
  grade: string;
  texture: "paper" | "canvas" | "none";
  particles: Particles;
  transition: Transition;
  font: CaptionFont;
  /** caption + title colour, and the scrim colour behind it */
  ink: string;
  scrim: string;
  /** warm/cool glow drifting over the frame, "" for none */
  glow: string;
};

export const ART_STYLES: ArtStyle[] = [
  {
    id: "ghibli",
    label: "Hand-painted anime (Ghibli-inspired)",
    prompt:
      "hand-painted anime film background art, soft watercolour and gouache, lush detailed scenery, towering soft clouds, gentle warm natural light, nostalgic peaceful mood, clean cel-shaded character design",
    grade: "saturate(1.05) contrast(1.02)",
    texture: "paper",
    particles: "pollen",
    transition: "wash",
    font: "serif",
    ink: "#FFF8EC",
    scrim: "#1B2A3A",
    glow: "#FFE2A8",
  },
  {
    id: "watercolour",
    label: "Watercolour",
    prompt:
      "loose watercolour illustration on cold-press paper, soft bleeding edges, pigment granulation, white paper showing through, delicate fine ink linework, airy light palette",
    grade: "saturate(1.02) contrast(1.0)",
    texture: "paper",
    particles: "dust",
    transition: "wash",
    font: "serif",
    ink: "#FFFFFF",
    scrim: "#2B3440",
    glow: "",
  },
  {
    id: "roman-mosaic",
    label: "Roman mosaic",
    prompt:
      "ancient Roman floor mosaic, small square stone and glass tesserae, visible grout lines, terracotta ochre umber and lapis blue palette, flat stylised figures, ornamental border, museum photograph",
    grade: "saturate(0.95) contrast(1.05)",
    texture: "none",
    particles: "dust",
    transition: "dissolve",
    font: "roman",
    ink: "#F6EBD9",
    scrim: "#2A1A12",
    glow: "#FFC98A",
  },
  {
    id: "sumi-e",
    label: "Sumi-e ink",
    prompt:
      "Japanese sumi-e ink wash painting, black ink on textured rice paper, expressive confident brush strokes, generous negative space, subtle grey washes, one small red seal stamp accent",
    grade: "grayscale(0.15) contrast(1.06)",
    texture: "paper",
    particles: "ink",
    transition: "ink",
    font: "serif",
    ink: "#1A1A1A",
    scrim: "#F3EEE4",
    glow: "",
  },
  {
    id: "impasto",
    label: "Impasto oil",
    prompt:
      "thick impasto oil painting, heavy palette-knife strokes, rich visible paint texture, dramatic chiaroscuro lighting, deep saturated colour",
    grade: "saturate(1.08) contrast(1.08)",
    texture: "canvas",
    particles: "dust",
    transition: "dissolve",
    font: "serif",
    ink: "#FFF6E8",
    scrim: "#1E140C",
    glow: "#FFB86B",
  },
  {
    id: "nocturne-gouache",
    label: "Nocturne gouache",
    prompt:
      "night scene in flat matte gouache, deep blues and teals, glowing warm windows and lamps, scattered stars, quiet contemplative mood, simple shapes, opaque paint texture",
    grade: "saturate(1.05) contrast(1.04)",
    texture: "paper",
    particles: "fireflies",
    transition: "bloom",
    font: "serif",
    ink: "#FFF3D6",
    scrim: "#0A1424",
    glow: "#FFCF7A",
  },
  {
    id: "botanical",
    label: "Botanical plate",
    prompt:
      "vintage scientific botanical illustration plate, fine engraved linework, delicate hand-tinted watercolour, aged cream paper, precise naturalist detail, centred specimen composition",
    grade: "sepia(0.12) contrast(1.02)",
    texture: "paper",
    particles: "pollen",
    transition: "wash",
    font: "serif",
    ink: "#2B2418",
    scrim: "#F4ECDC",
    glow: "",
  },
  {
    id: "paper-cut",
    label: "Paper cut",
    prompt:
      "layered paper-cut art diorama, many layers of coloured cardstock, soft drop shadows between layers, crisp cut edges, strong depth, handcrafted",
    grade: "saturate(1.04) contrast(1.03)",
    texture: "none",
    particles: "none",
    transition: "tear",
    font: "display",
    ink: "#FFFFFF",
    scrim: "#1D1A2E",
    glow: "",
  },
  {
    id: "art-nouveau",
    label: "Art nouveau",
    prompt:
      "Art Nouveau poster illustration, flowing organic linework, ornamental floral frame and halo, muted gold sage and rose palette, Mucha-inspired decorative composition, lithograph print texture",
    grade: "sepia(0.08) saturate(1.0)",
    texture: "paper",
    particles: "petals",
    transition: "dissolve",
    font: "serif",
    ink: "#FFF7E6",
    scrim: "#2A2016",
    glow: "#F5D58C",
  },
  {
    id: "golden-hour",
    label: "Golden hour",
    prompt:
      "cinematic digital painting at golden hour, warm low sun, long soft shadows, volumetric light rays through atmospheric haze, rich warm palette, painterly detail",
    grade: "saturate(1.06) contrast(1.03)",
    texture: "none",
    particles: "dust",
    transition: "bloom",
    font: "serif",
    ink: "#FFF6E6",
    scrim: "#2A160A",
    glow: "#FFB25E",
  },
];

export const styleById = (id: string | undefined) => ART_STYLES.find((s) => s.id === id) ?? ART_STYLES[0];

/** Full prompt for one scene's image. Same suffix every time keeps a video in one hand. */
export function imagePrompt(sceneprompt: string, style: ArtStyle, character: string | null) {
  // Character first and worded identically every time, so it stays the same character across scenes.
  const who = character ? `Main character, always drawn exactly the same: ${character}. ` : "";
  return `${who}Scene: ${sceneprompt}. Style: ${style.prompt}. Vertical 9:16 composition, main subject in the upper two thirds, calm uncluttered lower third. Absolutely no text anywhere: no letters, no words, no signs, no labels, no posters, no screens with writing, no captions, no watermark, no logo, no signature; any signs or packaging are blank.`;
}
