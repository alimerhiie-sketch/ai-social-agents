// Agent HQ render pipeline. Run by the dashboard's job queue:
//   node scripts/render.mjs <spec.json>
// spec = { kind: "reel" | "slides", outDir, bundleCacheDir, palette, handle, voice, speed, showCaptions, scenes,
//         artStyle?, character?, seed? }
// Prints "PROGRESS <text>" lines while working and one final "RESULT <json>" line.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { generateImage } from "./images.mjs";
import { imagePrompt, styleById } from "../src/artStyles.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.resolve(here, "..");
const FPS = 30;
const AUDIO_DELAY = 6; // frames between a scene starting and its voice starting (matches Reel.tsx)
const TAIL = 0.45; // seconds of air after each voice line
const SLIDE_SETTLED_FRAME = 150;

const say = (msg) => console.log(`PROGRESS ${msg}`);

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
spec.outDir = path.resolve(spec.outDir);
spec.bundleCacheDir = path.resolve(spec.bundleCacheDir);
fs.mkdirSync(spec.outDir, { recursive: true });

// ---------- bundle (cached by a hash of the template sources) ----------
function sourceHash() {
  const h = crypto.createHash("sha1");
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(e.name).update(fs.readFileSync(p));
    }
  };
  walk(path.join(studioRoot, "src"));
  h.update(fs.readFileSync(path.join(studioRoot, "package.json")));
  return h.digest("hex").slice(0, 12);
}

async function getServeUrl() {
  const dir = path.join(spec.bundleCacheDir, sourceHash());
  if (fs.existsSync(path.join(dir, "index.html"))) {
    say("Using cached template bundle");
    return dir;
  }
  say("Bundling templates (first render after a template change)…");
  return bundle({ entryPoint: path.join(studioRoot, "src", "index.ts"), outDir: dir });
}

// ---------- tiny static server so the renderer can fetch the voice files ----------
function serve(rawDir) {
  const dir = path.resolve(rawDir);
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!file.startsWith(dir) || !fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      const type = file.endsWith(".wav") ? "audio/wav" : file.endsWith(".jpg") ? "image/jpeg" : file.endsWith(".png") ? "image/png" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

// ---------- captions: short phrases timed across the voice line ----------
function phrases(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 5 || /[.,!?;:]$/.test(w)) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

function captionsFor(text, seconds) {
  const ps = phrases(text);
  const total = ps.reduce((a, p) => a + p.length, 0) || 1;
  let t = 0;
  return ps.map((p) => {
    const d = (p.length / total) * seconds;
    const c = { text: p.replace(/[*]/g, ""), from: AUDIO_DELAY + Math.round(t * FPS), to: AUDIO_DELAY + Math.round((t + d) * FPS) };
    t += d;
    return c;
  });
}

// ---------- reel ----------
async function renderReel(serveUrl) {
  const voiced = spec.scenes.filter((s) => s.voiceover?.trim());
  let tts = null;
  if (voiced.length) {
    say(`Loading the voice model (${spec.voice})…`);
    const { KokoroTTS } = await import("kokoro-js");
    tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
  }

  const { server, port } = await serve(spec.outDir);
  try {
    // Paint every illustrated scene first (the slowest, most failure-prone step).
    const style = spec.artStyle ? styleById(spec.artStyle) : null;
    const seed = spec.seed ?? Math.floor(Math.random() * 1e6);
    const images = {};
    const painted = spec.scenes.filter((s) => s.type === "illustration");
    let n = 0;
    for (const [i, s] of spec.scenes.entries()) {
      if (s.type !== "illustration" || !style) continue;
      n++;
      const file = `img-${String(i + 1).padStart(2, "0")}.jpg`;
      const out = path.join(spec.outDir, file);
      if (fs.existsSync(out) && fs.statSync(out).size > 10_000) {
        say(`Painting ${n}/${painted.length}: already done`);
      } else {
        say(`Painting ${n}/${painted.length} (${style.label}): ${String(s.imagePrompt).slice(0, 70)}…`);
        const t0 = Date.now();
        // one seed per video, plus the character reference, keep the character and palette consistent
        const r = await generateImage({ prompt: imagePrompt(s.imagePrompt || s.headline || "", style, s.withCharacter ? spec.character : null), seed, out, reference: s.withCharacter ? spec.characterRefReady : undefined });
        say(`  ↳ ${r.provider} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      images[i] = `http://127.0.0.1:${port}/${file}`;
    }

    const scenes = [];
    for (const [i, s] of spec.scenes.entries()) {
      const scene = { ...s };
      if (images[i]) scene.imageSrc = images[i];
      if (tts && s.voiceover?.trim()) {
        say(`Voice ${i + 1}/${spec.scenes.length}: "${s.voiceover.slice(0, 60)}"`);
        const audio = await tts.generate(s.voiceover.replace(/[*]/g, ""), { voice: spec.voice, speed: spec.speed ?? 1.05 });
        const file = `vo-${String(i + 1).padStart(2, "0")}.wav`;
        await audio.save(path.join(spec.outDir, file));
        const secs = audio.audio.length / audio.sampling_rate;
        scene.audioSrc = `http://127.0.0.1:${port}/${file}`;
        scene.durationInFrames = Math.max(AUDIO_DELAY + Math.ceil((secs + TAIL) * FPS), 45);
        scene.captions = captionsFor(s.voiceover, secs);
      } else {
        scene.durationInFrames = Math.max(45, Math.round((s.seconds || 3) * FPS));
      }
      scenes.push(scene);
    }

    const inputProps = { scenes, palette: spec.palette, handle: spec.handle, showCaptions: spec.showCaptions ?? true, artStyle: spec.artStyle };
    const composition = await selectComposition({ serveUrl, id: "Reel", inputProps });
    const output = path.join(spec.outDir, "video.mp4");
    say(`Rendering ${composition.durationInFrames} frames (${(composition.durationInFrames / FPS).toFixed(1)}s)…`);
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      crf: 18,
      outputLocation: output,
      inputProps,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 10) * 10;
        if (pct !== last) {
          last = pct;
          say(`Rendering… ${pct}%`);
        }
      },
    });

    // Cover frame: the hook once it has landed.
    const cover = path.join(spec.outDir, "cover.jpg");
    await renderStill({ serveUrl, composition, frame: Math.min(50, composition.durationInFrames - 1), output: cover, inputProps, imageFormat: "jpeg", jpegQuality: 92 });

    return { kind: "reel", files: ["video.mp4"], cover: "cover.jpg", durationSeconds: composition.durationInFrames / FPS };
  } finally {
    server.close();
  }
}

// ---------- slides (carousel or single post) ----------
async function renderSlides(serveUrl) {
  const files = [];
  const n = spec.scenes.length;
  const style = spec.artStyle ? styleById(spec.artStyle) : null;
  const seed = spec.seed ?? Math.floor(Math.random() * 1e6);
  const { server, port } = await serve(spec.outDir);
  try {
  for (const [i, s] of spec.scenes.entries()) {
    const scene = { ...s };
    if (scene.type === "illustration" && style) {
      const file = `img-${String(i + 1).padStart(2, "0")}.jpg`;
      const out = path.join(spec.outDir, file);
      if (!(fs.existsSync(out) && fs.statSync(out).size > 10_000)) {
        say(`Painting slide ${i + 1} (${style.label}): ${String(scene.imagePrompt).slice(0, 70)}…`);
        const r = await generateImage({ prompt: imagePrompt(scene.imagePrompt || scene.headline || "", style, scene.withCharacter ? spec.character : null), seed, out, aspect: "feed", reference: scene.withCharacter ? spec.characterRefReady : undefined });
        say(`  ↳ ${r.provider}`);
      }
      scene.imageSrc = `http://127.0.0.1:${port}/${file}`;
    }
    say(`Slide ${i + 1}/${n}`);
    const inputProps = { scene, index: i, total: n, palette: spec.palette, handle: spec.handle, isCover: i === 0, artStyle: spec.artStyle };
    const composition = await selectComposition({ serveUrl, id: "Slide", inputProps });
    const file = `slide-${String(i + 1).padStart(2, "0")}.jpg`;
    // Instagram's publishing API takes JPEG, not PNG.
    await renderStill({ serveUrl, composition, frame: SLIDE_SETTLED_FRAME, output: path.join(spec.outDir, file), inputProps, imageFormat: "jpeg", jpegQuality: 94 });
    files.push(file);
  }
  } finally {
    server.close();
  }
  return { kind: "slides", files, cover: files[0], durationSeconds: 0 };
}

// ---------- recurring character: one reference image per account, reused by every scene ----------
async function ensureCharacterRef() {
  const ref = spec.characterRef;
  if (!spec.character || !ref) return null;
  if (fs.existsSync(ref) && fs.statSync(ref).size > 10_000) return ref;
  fs.mkdirSync(path.dirname(ref), { recursive: true });
  say("Painting the character reference (once per account)…");
  const prompt = `Character reference sheet: ${spec.character}. Full body, standing, three-quarter view, friendly neutral pose, centred, plain soft pale background, clean illustration, consistent proportions. No text, no letters.`;
  const r = await generateImage({ prompt, seed: 1234, out: ref, aspect: "feed" });
  say(`  ↳ ${r.provider}`);
  return ref;
}

/** Next free-tier reset (00:00 UTC) plus a few minutes of margin. */
function nextReset() {
  const d = new Date();
  d.setUTCHours(24, 5, 0, 0);
  return d.toISOString();
}

try {
  spec.characterRefReady = await ensureCharacterRef();
  const serveUrl = await getServeUrl();
  const result = spec.kind === "reel" ? await renderReel(serveUrl) : await renderSlides(serveUrl);
  console.log(`RESULT ${JSON.stringify(result)}`);
  process.exit(0);
} catch (e) {
  console.error(e?.stack || String(e));
  const quota = !!e?.quota;
  console.log(`RESULT ${JSON.stringify({ error: String(e?.message || e), quota, retryAt: quota ? nextReset() : undefined })}`);
  process.exit(1);
}
