// The reel animation looks, as plain data (no Remotion imports) so the dashboard and the agents' prompts can use it.
// The Strategist picks one per reel (stored in content.art_style); the Video Producer animates in it.

export const REEL_LOOKS = [
  { id: "paper-blueprint", label: "Paper cartoon × 3D blueprint", when: "a relatable paper-cartoon story that cuts to 3D blueprint explainers for the technical part: how a tool works, what is inside, why it costs what it costs" },
  { id: "paper", label: "Paper cartoon", when: "work, money, founder and productivity stories, gentle humour, everyday situations" },
  { id: "blueprint", label: "3D blueprint", when: "pure 'how it works / explained' pieces about hardware, models, data, chips" },
  { id: "doodle", label: "Hand-drawn doodle", when: "funny relatable life, habits, before vs now" },
  { id: "lofi", label: "Lo-fi night", when: "late-night work, study, focus, calm reflective explainers" },
  { id: "cosmic", label: "Cosmic 3D", when: "big news, launches, the future, rankings, 'wow' moments" },
] as const;

export type ReelLookId = (typeof REEL_LOOKS)[number]["id"] | "brand";

export const REEL_LOOK_IDS: string[] = REEL_LOOKS.map((l) => l.id);
export const isReelLook = (id: string | null | undefined) => !!id && REEL_LOOK_IDS.includes(id);
