// Free image generation, in order of preference:
//  1. Cloudflare Workers AI free tier (needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)
//  2. Local ComfyUI on the laptop GPU (needs COMFYUI_URL, default http://127.0.0.1:8188, and a running ComfyUI)
//  3. Pollinations.ai, no account (only if ALLOW_POLLINATIONS isn't "0") — a development fallback
// Every provider writes a JPEG/PNG to `out`. Returns { provider, file }.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Read the project's .env.local directly, so keys added there work without restarting the dashboard.
(function loadEnvLocal() {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
})();


async function fetchWithTimeout(url, init = {}, ms = 120_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- 1. Cloudflare ----------
// Models are tried in order; the first that works is remembered for the rest of the render.
const CF_MODELS = (process.env.CF_IMAGE_MODELS || "@cf/leonardo/lucid-origin,@cf/black-forest-labs/flux-1-schnell").split(",");
let cfWorking = null;

const DIMS = {
  portrait: { cf: [832, 1472], comfy: [768, 1344], full: [1080, 1920] },
  feed: { cf: [1024, 1280], comfy: [896, 1152], full: [1080, 1350] },
};

async function cloudflare({ prompt, seed, out, aspect = "portrait" }) {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!id || !token) throw new Error("Cloudflare not configured");
  const models = cfWorking ? [cfWorking] : CF_MODELS;
  let lastErr;
  for (const model of models) {
    const body = model.includes("flux-1-schnell")
      ? { prompt, steps: 8, seed }
      : { prompt, width: DIMS[aspect].cf[0], height: DIMS[aspect].cf[1], seed, num_steps: 25, guidance: 4.5 };
    const res = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${id}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok) {
      lastErr = new Error(`Cloudflare ${model}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    let bytes;
    if (type.startsWith("image/")) bytes = Buffer.from(await res.arrayBuffer());
    else {
      const j = await res.json();
      const b64 = j?.result?.image;
      if (!b64) {
        lastErr = new Error(`Cloudflare ${model}: no image in response`);
        continue;
      }
      bytes = Buffer.from(b64, "base64");
    }
    fs.writeFileSync(out, bytes);
    cfWorking = model;
    return `cloudflare:${model.split("/").pop()}`;
  }
  throw lastErr ?? new Error("Cloudflare failed");
}

// ---------- 2. Local ComfyUI (SDXL Lightning, low-VRAM) ----------
async function comfy({ prompt, seed, out, aspect = "portrait" }) {
  const base = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
  const ckpt = process.env.COMFYUI_CHECKPOINT || "dreamshaperXL_lightningDPMSDE.safetensors";
  try {
    await fetchWithTimeout(`${base}/system_stats`, {}, 2500);
  } catch {
    throw new Error("Local ComfyUI is not running");
  }
  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: ckpt } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: "text, letters, watermark, logo, signature, blurry, deformed hands", clip: ["1", 1] } },
    "4": { class_type: "EmptyLatentImage", inputs: { width: DIMS[aspect].comfy[0], height: DIMS[aspect].comfy[1], batch_size: 1 } },
    "5": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0], seed, steps: 6, cfg: 2, sampler_name: "dpmpp_sde", scheduler: "karras", denoise: 1 } },
    "6": { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
    "7": { class_type: "SaveImage", inputs: { images: ["6", 0], filename_prefix: "agenthq" } },
  };
  const r = await fetchWithTimeout(`${base}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: graph }) });
  if (!r.ok) throw new Error(`ComfyUI: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const { prompt_id } = await r.json();
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 1500));
    const h = await (await fetchWithTimeout(`${base}/history/${prompt_id}`)).json();
    const img = h?.[prompt_id]?.outputs?.["7"]?.images?.[0];
    if (img) {
      const v = await fetchWithTimeout(`${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`);
      fs.writeFileSync(out, Buffer.from(await v.arrayBuffer()));
      return "local-gpu";
    }
  }
  throw new Error("ComfyUI timed out");
}

// ---------- 3. Pollinations (dev fallback) ----------
async function pollinations({ prompt, seed, out, aspect = "portrait" }) {
  const [W, H] = DIMS[aspect].full;
  if (process.env.ALLOW_POLLINATIONS === "0") throw new Error("Pollinations disabled");
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${W}&height=${H}&seed=${seed}&model=flux&nologo=true&private=true`;
  const res = await fetchWithTimeout(url, {}, 180_000);
  if (!res.ok) throw new Error(`Pollinations: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 10_000) throw new Error("Pollinations returned no image");
  fs.writeFileSync(out, bytes);
  return "pollinations";
}

export async function generateImage({ prompt, seed, out, aspect = "portrait" }) {
  const errors = [];
  for (const provider of [cloudflare, comfy, pollinations]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { provider: await provider({ prompt, seed, out, aspect }), file: out };
      } catch (e) {
        const msg = String(e?.message || e);
        // "not configured / not running / disabled" won't fix itself on retry
        if (/not configured|not running|disabled/.test(msg)) {
          errors.push(msg);
          break;
        }
        if (attempt === 1) errors.push(msg);
        else await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw new Error(`No image provider worked:\n- ${errors.join("\n- ")}`);
}
