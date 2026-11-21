// Choices offered on the account profile form. The ids are what the agents see.

export const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
] as const;

export const LANGUAGES = [
  "English",
  "Arabic (Lebanese dialect)",
  "Arabic (MSA)",
  "French",
  "English + Arabic mix",
];

export const TONES = [
  "Educational",
  "Entertaining / funny",
  "Inspirational",
  "Storytelling",
  "News & commentary",
  "Luxury / aesthetic",
  "Motivational",
  "Contrarian / opinion",
  "Calm / cozy",
];

export const FORMATS = [
  { id: "reel", label: "Short videos", hint: "Reels + TikToks" },
  { id: "carousel", label: "Carousels", hint: "Swipe posts / TikTok photo mode" },
  { id: "post", label: "Single posts", hint: "One designed image" },
  { id: "story", label: "Stories", hint: "24-hour stories" },
];

// Each style maps to a Remotion template family in Phase 2. All are producible for free:
// no on-camera person, no paid AI video.
export const VIDEO_STYLES = [
  { id: "kinetic-type", label: "Kinetic typography", hint: "Animated text carries the story" },
  { id: "broll-voiceover", label: "Stock b-roll + voiceover", hint: "Faceless, free stock footage" },
  { id: "mg-explainer", label: "Motion-graphic explainer", hint: "Diagrams, icons, shapes" },
  { id: "listicle", label: "List / countdown", hint: "Top 5, 3 things…" },
  { id: "quote-card", label: "Quote / text cards", hint: "Minimal, one idea per screen" },
  { id: "data-story", label: "Data story", hint: "Charts and numbers in motion" },
  { id: "news-recap", label: "News recap", hint: "Headline-style trend breakdowns" },
];

export const MODELS = [
  { id: "haiku", label: "Haiku — lightest on usage" },
  { id: "sonnet", label: "Sonnet — balanced" },
  { id: "opus", label: "Opus — best quality, heaviest" },
];

export { ART_STYLES } from "../../studio/src/artStyles";
export { REEL_LOOKS, REEL_LOOK_IDS, isReelLook } from "../../studio/src/motion/lookIds";

export const CONTENT_STATUSES = ["scripted", "approved", "producing", "review", "ready", "scheduled", "posted", "rejected"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
