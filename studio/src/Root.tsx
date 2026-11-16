import React from "react";
import { Composition } from "remotion";
import { Reel, sceneFrames } from "./Reel";
import { Slide, SLIDE_SETTLED_FRAME } from "./Slide";
import { AMX_PALETTE, FPS, type ReelProps, type Scene, type SlideProps } from "./types";

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

// Preview data for `npm run studio`; real renders pass their own props.
const demo: ReelProps = {
  palette: AMX_PALETTE,
  handle: "amx_ai1",
  showCaptions: true,
  scenes: [
    { ...blank, type: "hook", kicker: "AI news", headline: "ChatGPT can now *spend your money.*", subline: "Here's what actually protects you.", seconds: 3.4 },
    { ...blank, type: "steps", kicker: "How it works", headline: "Three checks before it pays", items: ["The agent asks to buy", "You approve with Face ID", "The store sees a stand-in number"], seconds: 5 },
    { ...blank, type: "compare", kicker: "Who gets it", headline: "Right now", left: { label: "You", value: "Not yet" }, right: { label: "US · Pro plan", value: "Available" }, seconds: 3.5 },
    { ...blank, type: "stat", kicker: "Cost to you", headline: "", number: "$0", numberLabel: "Nothing to do yet", seconds: 3 },
    { ...blank, type: "verdict", kicker: "Hype meter", headline: "Interesting. Not for most of us *yet.*", score: 2, scoreMax: 5, seconds: 3.6 },
    { ...blank, type: "list", kicker: "Remember", headline: "Before you let AI pay", items: ["Approve every purchase", "Use a stand-in card", "Check the store"], seconds: 4 },
    { ...blank, type: "cta", headline: "Send this to the friend who *buys everything online.*", subline: "AI, explained like you're busy.", seconds: 3.4 },
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
