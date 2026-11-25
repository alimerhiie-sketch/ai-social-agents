import React from "react";
import { PosterSlide } from "./poster/Poster";
import type { SlideProps } from "./types";

// 1080×1350 feed slides: bold flat posters drawn in code (see poster/Poster.tsx). No painted images.
export const SLIDE_SETTLED_FRAME = 150;

export function Slide({ scene, index, total, handle, mascot, palette }: SlideProps & { mascot?: boolean }) {
  return <PosterSlide scene={scene} index={index} total={total} handle={handle} mascot={mascot ?? true} palette={palette} />;
}
