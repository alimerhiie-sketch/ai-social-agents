import React from "react";
import { Composition } from "remotion";
import { Reel, sceneFrames } from "./Reel";
import { Slide, SLIDE_SETTLED_FRAME } from "./Slide";
import { AMX_PALETTE, FPS, type Beat, type ReelProps, type Scene, type SlideProps } from "./types";

const blank: Omit<Scene, "type" | "headline"> = {
  kicker: "",
  subline: "",
  items: [],
  number: "",
  numberLabel: "",
  left: { label: "", value: "" },
  right: { label: "", value: "" },
  score: 0,
  scoreMax: 5,
  voiceover: "",
  seconds: 3,
};

const beat = (b: Partial<Beat>): Beat => ({ say: "", visual: "title", text: "", icon: "", items: [], number: "", level: 0, pose: "idle", transition: "cut", ...b });
const it = (icon: string, label: string, value = "") => ({ icon, label, value });

// Preview data for `npm run studio`: one of every motion visual. Real renders pass their own props.
const demo: ReelProps = {
  palette: AMX_PALETTE,
  handle: "amx_ai1",
  showCaptions: true,
  artStyle: "ghibli",
  scenes: [
    {
      ...blank,
      type: "motion",
      headline: "",
      voiceover: "What is a token in AI? Here is the thirty second version.",
      seconds: 4.4,
      beats: [
        beat({ say: "What is a token in AI?", visual: "title", text: "What is a *token* in AI?", transition: "cut" }),
        beat({ say: "Here is the thirty second version.", visual: "character", pose: "wave", text: "30-second version", transition: "whip" }),
      ],
    },
    {
      ...blank,
      type: "motion",
      headline: "",
      voiceover: "AI doesn't read whole words. It cuts text into small chunks.",
      seconds: 4.6,
      beats: [
        beat({ say: "AI doesn't read whole words.", visual: "icon", icon: "book-open", text: "Not whole words", transition: "zoom" }),
        beat({ say: "It cuts text into small chunks.", visual: "split", text: "Un|believ|able", transition: "wipe" }),
      ],
    },
    {
      ...blank,
      type: "motion",
      headline: "",
      voiceover: "Limits are counted in tokens, and so is the price.",
      seconds: 4.4,
      beats: [
        beat({ say: "Limits are counted in tokens,", visual: "meter", text: "Limit", level: 0.8, transition: "iris" }),
        beat({ say: "and so is the price.", visual: "counter", number: "100,000", text: "tokens ≈ 75,000 words", level: 0.75, transition: "whip" }),
      ],
    },
    {
      ...blank,
      type: "motion",
      headline: "",
      voiceover: "You type, it chunks, it answers. Free versus paid.",
      seconds: 5,
      beats: [
        beat({ say: "You type, it chunks, it answers.", visual: "flow", items: [it("keyboard", "You type"), it("scissors", "It chunks"), it("sparkles", "It answers")], transition: "zoom" }),
        beat({ say: "Free versus paid.", visual: "versus", items: [it("gift", "Free", "Short limit"), it("crown", "Paid", "Long limit")], transition: "wipe" }),
      ],
    },
    {
      ...blank,
      type: "motion",
      headline: "",
      voiceover: "Ask it to explain tokens. Three things to remember. Which uses more?",
      seconds: 6,
      beats: [
        beat({ say: "Ask it to explain tokens.", visual: "chat", items: [it("", "you", "What is a token?"), it("", "ai", "A small chunk of text, often part of a word.")], transition: "iris" }),
        beat({ say: "Three things to remember.", visual: "checklist", text: "Remember", items: [it("", "Tokens are chunks"), it("", "Limits count them"), it("", "Prices count them")], transition: "whip" }),
        beat({ say: "Which uses more?", visual: "bars", items: [it("mail", "Email", "300"), it("file-text", "Essay", "1,500"), it("book", "Book", "90,000")], transition: "zoom" }),
      ],
    },
    {
      ...blank,
      type: "motion",
      headline: "",
      voiceover: "Send this to a friend who keeps nodding along.",
      seconds: 3.4,
      beats: [beat({ say: "Send this to a friend who keeps nodding along.", visual: "character", pose: "cheer", icon: "send", text: "Send this to a friend", transition: "wipe" })],
    },
  ],
};

const demoSlide: SlideProps = {
  scene: { ...blank, type: "hook", kicker: "Cheat sheet", headline: "5 rules before you click *any* new AI link" },
  index: 0,
  total: 6,
  palette: AMX_PALETTE,
  handle: "amx_ai1",
  isCover: true,
};

export function Root() {
  return (
    <>
      <Composition
        id="Reel"
        component={Reel}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={300}
        defaultProps={demo}
        calculateMetadata={({ props }) => ({ durationInFrames: Math.max(30, props.scenes.reduce((a, s) => a + sceneFrames(s), 0)) })}
      />
      {/* a short composition rather than a <Still>, so entrances can settle before the frame is taken */}
      <Composition id="Slide" component={Slide} width={1080} height={1350} fps={FPS} durationInFrames={SLIDE_SETTLED_FRAME + 1} defaultProps={demoSlide} />
    </>
  );
}
