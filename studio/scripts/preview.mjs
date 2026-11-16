// Renders stills of the demo reel at chosen frames (plus the demo slide) for design review.
// Usage: node scripts/preview.mjs <outDir> [frame,frame,...]
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const out = process.argv[2];
const frames = (process.argv[3] ?? "40,170,300,400,490,600,720").split(",").map(Number);
fs.mkdirSync(out, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const reel = await selectComposition({ serveUrl, id: "Reel" });
console.log("reel frames:", reel.durationInFrames);
for (const f of frames) {
  if (f >= reel.durationInFrames) continue;
  await renderStill({ serveUrl, composition: reel, frame: f, output: path.join(out, `reel-${String(f).padStart(4, "0")}.png`), scale: 0.5 });
  console.log("frame", f);
}
const slide = await selectComposition({ serveUrl, id: "Slide" });
await renderStill({ serveUrl, composition: slide, frame: slide.durationInFrames - 1, output: path.join(out, "slide.png"), scale: 0.5 });
console.log("done");
