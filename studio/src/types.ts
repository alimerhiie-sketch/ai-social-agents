// Shared contract between the agents (scene plans), the render script and the templates.

export type SceneType = "motion" | "illustration" | "hook" | "statement" | "list" | "steps" | "stat" | "compare" | "verdict" | "cta";

export type Camera = "push-in" | "pull-out" | "pan-left" | "pan-right" | "rise" | "drift";

/** What a motion beat shows. Every visual is built in code (Remotion), except `painting`. */
export type BeatVisual =
  | "title"
  | "icon"
  | "icons"
  | "split"
  | "counter"
  | "bars"
  | "versus"
  | "flow"
  | "meter"
  | "character"
  | "chat"
  | "checklist"
  | "painting";

export type Pose = "idle" | "wave" | "point" | "think" | "shrug" | "cheer" | "hold" | "surprised";

export type BeatTransition = "cut" | "whip" | "zoom" | "wipe" | "iris";

export type BeatItem = { icon: string; label: string; value: string };

/**
 * One motion beat: 1–2.5 s of the voice line with its own visual. A scene's beats split its voiceover in order.
 */
export type Beat = {
  /** The exact words of the voiceover spoken during this beat (shown as kinetic captions). */
  say: string;
  visual: BeatVisual;
  /** On-screen words: the title, the icon's label, the split phrase ("Un|believ|able"), the meter's limit label… */
  text: string;
  /** Lucide icon name in kebab-case, e.g. "scissors", "coins", "message-circle". "" for none. */
  icon: string;
  /** icons / bars / versus / flow / chat / checklist rows. chat: label "you" or "ai", value = the message. */
  items: BeatItem[];
  /** counter: the figure, e.g. "100,000", "$20", "75%" */
  number: string;
  /** meter fill / counter ring, 0–1 */
  level: number;
  /** character pose */
  pose: Pose;
  /** how this beat enters */
  transition: BeatTransition;
};

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
  /** motion: the beats that play over this scene's voice line */
  beats?: Beat[];

  // Filled in by the render script:
  imageSrc?: string;
  audioSrc?: string;
  durationInFrames?: number;
  /** length of the spoken voice in frames (beats are timed across it) */
  voiceFrames?: number;
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
  /** the recurring character, drawn in code: body / eye / scarf colours */
  mascot?: { body: string; eye: string; scarf: string };
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
