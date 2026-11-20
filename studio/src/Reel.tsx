import React from "react";
import { styleById } from "./artStyles";
import { MotionReel } from "./motion/MotionReel";
import type { ReelProps, Scene } from "./types";

export const sceneFrames = (s: Scene) => s.durationInFrames ?? Math.round((s.seconds || 3) * 30);

/**
 * Every reel renders as motion graphics: each scene's voice line is cut into 1–2.5 s beats, each with its own
 * code-built visual (kinetic type, icons, diagrams, the character), inside a layered 3D world.
 * Scenes planned before beats existed are converted (see motion/timing.ts).
 */
export function Reel(props: ReelProps) {
  const style = props.artStyle ? styleById(props.artStyle) : null;
  return <MotionReel {...props} style={style} sceneFrames={sceneFrames} />;
}
