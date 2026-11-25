// Agent HQ render pipeline. Run by the dashboard's job queue:
//   node scripts/render.mjs <spec.json>
// spec = { kind: "reel" | "slides", outDir, bundleCacheDir, palette, handle, voice, speed, showCaptions, scenes,
//         artStyle?, character?, seed? }
// Prints "PROGRESS <text>" lines while working and one final "RESULT <json>" line.

import crypto from "node:crypto";
import os from "node:os";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { generateImage } from "./images.mjs";
import { writeSfx } from "./sfx.mjs";
import { imagePrompt, styleById } from "../src/artStyles.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.resolve(here, "..");
const FPS = 30;
const AUDIO_DELAY = 6; // frames between a scene starting and its voice starting (matches Reel.tsx)
const TAIL = 0.45; // seconds of air after each voice line
const SLIDE_SETTLED_FRAME = 150;
// 3D looks need WebGL; the GitHub runner has no GPU, so use the software path there.
const GL = process.platform === "linux" ? { gl: "swangle" } : undefined;

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
    // Motion scenes may have one painted plate (an empty environment in the account's art style, shown far
    // back and in the `painting` beat). The character is drawn in code, so plates never include it.
    // Painted plates only belong to the brand look; the animation looks are fully drawn in code.
    const wantsPaint = (s) => s.type === "illustration" || (s.type === "motion" && (!spec.look || spec.look === "brand") && String(s.imagePrompt || "").trim());
    const painted = spec.scenes.filter(wantsPaint);
    let n = 0;
    for (const [i, s] of spec.scenes.entries()) {
      if (!wantsPaint(s) || !style) continue;
      n++;
      const file = `img-${String(i + 1).padStart(2, "0")}.jpg`;
      const out = path.join(spec.outDir, file);
      if (fs.existsSync(out) && fs.statSync(out).size > 10_000) {
        say(`Painting ${n}/${painted.length}: already done`);
      } else {
        say(`Painting ${n}/${painted.length} (${style.label}): ${String(s.imagePrompt).slice(0, 70)}…`);
        const t0 = Date.now();
        // one seed per video, plus the character reference, keep the character and palette consistent
        const plate = s.type === "motion";
        const scenePrompt = plate ? `Empty environment, no people, no characters, no figures: ${s.imagePrompt}` : s.imagePrompt || s.headline || "";
        const withChar = !plate && s.withCharacter;
        const r = await generateImage({ prompt: imagePrompt(scenePrompt, style, withChar ? spec.character : null), seed, out, reference: withChar ? spec.characterRefReady : undefined });
        say(`  ↳ ${r.provider} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      images[i] = `http://127.0.0.1:${port}/${file}`;
    }

    // Cinematic look: one photoreal frame per shot beat (free Flux), cached by prompt, one seed per reel.
    const shotScenes = spec.look === "cinematic" ? await paintShots(spec.scenes, seed, port) : spec.scenes;
    const sfx = spec.look === "cinematic" ? Object.fromEntries(Object.entries(writeSfx(spec.outDir)).map(([k, f]) => [k, `http://127.0.0.1:${port}/${f}`])) : undefined;

    const scenes = [];
    for (const [i, s] of shotScenes.entries()) {
      const scene = { ...s };
      if (images[i]) scene.imageSrc = images[i];
      if (tts && s.voiceover?.trim()) {
        say(`Voice ${i + 1}/${spec.scenes.length}: "${s.voiceover.slice(0, 60)}"`);
        const audio = await tts.generate(s.voiceover.replace(/[*]/g, ""), { voice: spec.voice, speed: spec.look === "cinematic" ? Math.max(spec.speed ?? 1, 1.2) : spec.speed ?? 1.05 });
        const file = `vo-${String(i + 1).padStart(2, "0")}.wav`;
        await audio.save(path.join(spec.outDir, file));
        const secs = audio.audio.length / audio.sampling_rate;
        scene.audioSrc = `http://127.0.0.1:${port}/${file}`;
        scene.durationInFrames = Math.max(AUDIO_DELAY + Math.ceil((secs + (spec.look === "cinematic" ? 0.1 : TAIL)) * FPS), spec.look === "cinematic" ? 24 : 45);
        scene.voiceFrames = Math.round(secs * FPS);
        scene.captions = captionsFor(s.voiceover, secs);
      } else {
        scene.durationInFrames = Math.max(45, Math.round((s.seconds || 3) * FPS));
      }
      scenes.push(scene);
    }

    const inputProps = { scenes, palette: spec.palette, handle: spec.handle, showCaptions: spec.showCaptions ?? true, artStyle: spec.artStyle, look: spec.look, sfx };
    const composition = await selectComposition({ serveUrl, id: "Reel", inputProps, chromiumOptions: GL });
    const output = path.join(spec.outDir, "video.mp4");
    say(`Rendering ${composition.durationInFrames} frames (${(composition.durationInFrames / FPS).toFixed(1)}s)…`);
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      // Delivery quality: Instagram/TikTok re-encode to ~3–5 Mbps anyway, and cloud storage caps files at 25 MB.
      // every core: Remotion defaults to half, and the runner is CPU-only
      concurrency: os.cpus().length,
      crf: 21,
      encodingMaxRate: "4500k",
      encodingBufferSize: "9000k",
      outputLocation: output,
      inputProps,
      chromiumOptions: GL,
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
    await renderStill({ serveUrl, composition, frame: Math.min(50, composition.durationInFrames - 1), output: cover, inputProps, imageFormat: "jpeg", jpegQuality: 92, chromiumOptions: GL });

    return { kind: "reel", files: ["video.mp4"], cover: "cover.jpg", durationSeconds: composition.durationInFrames / FPS };
  } finally {
    server.close();
  }
}

// ---------- cinematic shots ----------
// The owner's standing cinematographer rule for every generated image.
const CINE =
  "Photorealistic cinematic still, shot on ARRI Alexa 65 with a 40mm prime, motivated Rembrandt key light with soft falloff, Kodak Vision3 5219 film stock, fine grain, natural skin texture, shallow depth of field, high dynamic range, documentary realism, no text, no watermark.";
// ~120 free-tier neurons per 832x1472 frame; the daily allowance is shared by every account.
const MAX_SHOTS = 14;

async function paintShots(srcScenes, seed, port) {
  const scenes = srcScenes.map((s) => ({ ...s, beats: (s.beats ?? []).map((b) => ({ ...b })) }));
  const shots = scenes.flatMap((s) => s.beats).filter((b) => b.visual === "shot" && String(b.imagePrompt || "").trim());
  const unique = [...new Set(shots.map((b) => b.imagePrompt.trim()))];
  const painted = new Map();
  let n = 0;
  let last = null;
  for (const b of shots) {
    const p = b.imagePrompt.trim();
    if (!painted.has(p)) {
      if (painted.size >= MAX_SHOTS) {
        // over budget: hold the previous frame (the camera move and callout still change)
        b.imageSrc = last;
        continue;
      }
      const prompt = `${p} Vertical 9:16 frame, the subject large and centred. ${CINE}`;
      const file = `shot-${crypto.createHash("sha1").update(`${prompt}|${seed}`).digest("hex").slice(0, 12)}.jpg`;
      const out = path.join(spec.outDir, file);
      n++;
      if (fs.existsSync(out) && fs.statSync(out).size > 10_000) say(`Shot ${n}/${Math.min(unique.length, MAX_SHOTS)}: already painted`);
      else {
        say(`Shot ${n}/${Math.min(unique.length, MAX_SHOTS)}: ${p.slice(0, 70)}…`);
        const t0 = Date.now();
        const r = await generateImage({ prompt, seed, out, aspect: "portrait" });
        say(`  ↳ ${r.provider} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      painted.set(p, `http://127.0.0.1:${port}/${file}`);
    }
    b.imageSrc = painted.get(p);
    last = b.imageSrc;
  }
  return scenes;
}

// ---------- slides (carousel or single post) ----------
async function renderSlides(serveUrl) {
  // Feed posts are flat posters drawn in code: no image model, no character reference.
  const files = [];
  const n = spec.scenes.length;
  for (const [i, scene] of spec.scenes.entries()) {
    say(`Slide ${i + 1}/${n}`);
    const inputProps = { scene, index: i, total: n, palette: spec.palette, handle: spec.handle, isCover: i === 0, artStyle: spec.artStyle, mascot: !!spec.character };
    const composition = await selectComposition({ serveUrl, id: "Slide", inputProps });
    const file = `slide-${String(i + 1).padStart(2, "0")}.jpg`;
    // Instagram's publishing API takes JPEG, not PNG.
    await renderStill({ serveUrl, composition, frame: SLIDE_SETTLED_FRAME, output: path.join(spec.outDir, file), inputProps, imageFormat: "jpeg", jpegQuality: 94 });
    files.push(file);
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
  spec.characterRefReady = spec.kind === "reel" ? await ensureCharacterRef() : null;
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
