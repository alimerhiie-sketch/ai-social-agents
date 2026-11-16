// Shared contract between the agents (scene plans), the render script and the templates.

export type SceneType = "illustration" | "hook" | "statement" | "list" | "steps" | "stat" | "compare" | "verdict" | "cta";

export type Camera = "push-in" | "pull-out" | "pan-left" | "pan-right" | "rise" | "drift";

export type Scene = {
  type: SceneType;
  /** Small tracked label above the headline, e.g. "AI NEWS" or "HYPE CHECK". "" for none. */
  kicker: string;
  /** Main line. Wrap ONE key word or short phrase in *asterisks* to emphasise it. */
  headline: string;
  subline: string;
  /** list / steps rows */
  items: string[];
  /** stat: the big figure, e.g. "3", "$20", "82%" */
  number: string;
  numberLabel: string;
  /** compare: two sides */
  left: { label: string; value: string };
  right: { label: string; value: string };
  /** verdict: hype meter */
  score: number;
  scoreMax: number;
  /** Spoken line for this scene ("" = text only) */
  voiceover: string;
  /** Minimum on-screen time in seconds (used when there is no voiceover) */
  seconds: number;

  /** illustration: what the image shows (no style words — the account's art style is added) */
  imagePrompt?: string;
  /** illustration: put the account's recurring character in this image */
  withCharacter?: boolean;
  camera?: Camera;

  // Filled in by the render script:
  imageSrc?: string;
  audioSrc?: string;
  durationInFrames?: number;
  captions?: { text: string; from: number; to: number }[];
};

export type Palette = {
  /** main field colour */
  field: string;
  /** darker partner */
  deep: string;
  /** light accent for emphasis */
  soft: string;
  /** text colour */
  ink: string;
};

export type ReelProps = {
  scenes: Scene[];
  /** art style id (see artStyles.ts); illustration scenes use its treatment */
  artStyle?: string;
  palette: Palette;
  handle: string;
  showCaptions: boolean;
};

export type SlideProps = {
  scene: Scene;
  index: number;
  total: number;
  palette: Palette;
  handle: string;
  /** 1080×1350 feed post */
  isCover: boolean;
  artStyle?: string;
};

export const AMX_PALETTE: Palette = { field: "#1330E0", deep: "#0B1FA8", soft: "#93A6FF", ink: "#EEF1F8" };

export const FPS = 30;
