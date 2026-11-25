// Free sound design for the cinematic look: whoosh, impact and riser, synthesized as 16-bit mono WAVs.
// Deterministic (seeded noise), so every render sounds the same and nothing is downloaded.

import fs from "node:fs";
import path from "node:path";

const RATE = 44100;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
}

/** One-pole-pair state-variable filter, cutoff in Hz per sample. */
function svf() {
  let low = 0;
  let band = 0;
  return (x, cutoff, q = 0.7) => {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, RATE / 6)) / RATE);
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    return { low, band, high };
  };
}

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.tanh(samples[i] * g * 1.2) * 32000), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

function whoosh() {
  const len = Math.round(RATE * 0.55);
  const out = new Float32Array(len);
  const r = rng(7);
  const a = svf();
  const b = svf();
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.35)), 2) * (t < 0.74 ? 1 : 1 - (t - 0.74) / 0.26);
    const cutoff = 300 + 3200 * Math.sin(Math.PI * Math.min(1, t * 1.2));
    const n = r();
    out[i] = (a(n, cutoff, 0.35).band * 0.8 + b(n, cutoff * 2.4, 0.6).band * 0.25) * env;
  }
  return out;
}

function impact() {
  const len = Math.round(RATE * 1.1);
  const out = new Float32Array(len);
  const r = rng(11);
  const lp = svf();
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / RATE;
    const freq = 42 + 110 * Math.exp(-t * 16);
    phase += (2 * Math.PI * freq) / RATE;
    const body = Math.sin(phase) * Math.exp(-t * 3.2);
    const crack = lp(r(), 2500 * Math.exp(-t * 20) + 200, 0.5).low * Math.exp(-t * 28) * 1.4;
    const tail = lp(r(), 400, 0.9).low * Math.exp(-t * 4) * 0.25;
    out[i] = body * 1.1 + crack + tail;
  }
  return out;
}

function riser() {
  const len = Math.round(RATE * 1.4);
  const out = new Float32Array(len);
  const r = rng(23);
  const f1 = svf();
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const env = Math.pow(t, 2.2) * (t > 0.97 ? (1 - t) / 0.03 : 1);
    const freq = 180 + 1400 * Math.pow(t, 2);
    phase += (2 * Math.PI * freq) / RATE;
    const tone = Math.sin(phase) * 0.35 + Math.sin(phase * 1.5) * 0.15;
    const air = f1(r(), 600 + 6000 * t, 0.4).high * 0.6;
    out[i] = (tone + air) * env;
  }
  return out;
}

/** Writes the three effects into `dir` (once) and returns their file names. */
export function writeSfx(dir) {
  const files = { whoosh: "sfx-whoosh.wav", impact: "sfx-impact.wav", riser: "sfx-riser.wav" };
  const make = { whoosh, impact, riser };
  for (const [k, name] of Object.entries(files)) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) writeWav(p, make[k]());
  }
  return files;
}
