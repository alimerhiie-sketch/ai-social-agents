import type { Beat, BeatTransition, Scene } from "../types";

export const FPS = 30;
/** frames between a scene starting and its voice starting (matches AUDIO_DELAY in render.mjs) */
export const AUDIO_DELAY = 6;
/** frames an outgoing beat stays on screen while the next one enters */
export const OUT = 10;

export type Word = { text: string; em: boolean; at: number };

export type PlacedBeat = {
  beat: Beat;
  scene: Scene;
  sceneIndex: number;
  index: number;
  /** global start frame and length (without the exit overlap) */
  from: number;
  d: number;
  /** caption words, `at` relative to the beat start */
  words: Word[];
  exit: BeatTransition;
  last: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);

export const blankBeat = (b: Partial<Beat>): Beat => ({
  say: "",
  visual: "title",
  text: "",
  icon: "",
  items: [],
  number: "",
  level: 0,
  pose: "idle",
  transition: "cut",
  ...b,
});

/** Phrases of at most `max` words, broken after punctuation. */
export function phrases(text: string, max = 5) {
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of wordsOf(text)) {
    cur.push(w);
    if (cur.length >= max || /[.,!?;:]$/.test(w)) {
      out.push(cur.join(" "));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

const TRANSITIONS: BeatTransition[] = ["whip", "zoom", "wipe", "iris", "cut"];

/**
 * Scenes planned before motion beats existed (illustration / steps / stat / …) are turned into beats,
 * so every reel renders in the motion system.
 */
export function beatsFor(scene: Scene, sceneIndex: number): Beat[] {
  if (scene.beats?.length) return scene.beats;
  const vo = scene.voiceover?.trim() || "";
  const tr = TRANSITIONS[sceneIndex % TRANSITIONS.length];
  const head = (scene.headline || "").trim();
  const ps = phrases(vo, 5);
  const firstSay = ps.shift() ?? "";
  const rest = ps.join(" ");
  const tail = (extra: Beat[]) => (rest ? [...extra, ...phrases(rest, 6).map((p, i) => blankBeat({ say: p, visual: "title", text: p, transition: i % 2 ? "zoom" : "whip" }))] : extra);

  switch (scene.type) {
    case "steps":
    case "list":
      return [blankBeat({ say: vo, visual: "checklist", text: head, items: scene.items.map((label) => ({ icon: "", label, value: "" })), transition: tr })];
    case "stat":
      return [blankBeat({ say: vo, visual: "counter", number: scene.number, text: scene.numberLabel || head, level: 0, transition: tr })];
    case "compare":
      return [
        blankBeat({
          say: vo,
          visual: "versus",
          text: head,
          items: [
            { icon: "", label: scene.left.label, value: scene.left.value },
            { icon: "", label: scene.right.label, value: scene.right.value },
          ],
          transition: tr,
        }),
      ];
    case "verdict":
      return [blankBeat({ say: vo, visual: "meter", text: `${scene.score} / ${scene.scoreMax || 5}`, level: scene.score / Math.max(1, scene.scoreMax || 5), transition: tr })];
    default: {
      // illustration / hook / statement / cta
      const first: Beat[] = [];
      if (scene.imageSrc || scene.type === "illustration") first.push(blankBeat({ say: firstSay, visual: "painting", text: head, transition: tr }));
      else first.push(blankBeat({ say: firstSay, visual: "title", text: head || firstSay, transition: tr }));
      return tail(first);
    }
  }
}

/** Gives each beat its own share of the voice: a beat starts when its first word is spoken. */
export function placeBeats(scenes: Scene[], sceneFrames: (s: Scene) => number) {
  const placed: PlacedBeat[] = [];
  let start = 0;
  scenes.forEach((scene, si) => {
    const total = sceneFrames(scene);
    const beats = beatsFor(scene, si).filter(Boolean);
    if (!beats.length) beats.push(blankBeat({ say: scene.voiceover || "", text: scene.headline || "" }));
    const spoken = Math.max(1, scene.voiceFrames ?? total - AUDIO_DELAY - 12);

    // The captions must be what is actually said. If the beats' `say` lines don't add up to the voiceover,
    // share the voiceover's words between the beats in the same proportions.
    const vo = (scene.voiceover || "").replace(/\*/g, "");
    let says = beats.map((b) => b.say || "");
    if (vo.trim() && norm(says.join(" ")) !== norm(vo)) {
      const words = wordsOf(vo);
      const weights = says.map((s) => Math.max(1, wordsOf(s).length));
      const sum = weights.reduce((a, b) => a + b, 0);
      let at = 0;
      says = weights.map((w, i) => {
        const n = i === weights.length - 1 ? words.length - at : Math.round((w / sum) * words.length);
        const part = words.slice(at, at + n).join(" ");
        at += n;
        return part;
      });
    }

    const weights = says.map((s) => Math.max(4, s.replace(/\*/g, "").length + 2));
    const sum = weights.reduce((a, b) => a + b, 0);
    let cum = 0;
    const starts: number[] = [];
    const shares: number[] = [];
    for (const w of weights) {
      starts.push(cum / sum);
      shares.push(w / sum);
      cum += w;
    }
    beats.forEach((beat, bi) => {
      const rel = bi === 0 ? 0 : Math.round(AUDIO_DELAY + starts[bi] * spoken);
      const relNext = bi === beats.length - 1 ? total : Math.round(AUDIO_DELAY + starts[bi + 1] * spoken);
      const d = Math.max(8, relNext - rel);
      const ws = wordsOf(says[bi]);
      let em = false;
      const words: Word[] = ws.map((raw, wi) => {
        let w = raw;
        if (w.startsWith("*")) {
          em = true;
          w = w.slice(1);
        }
        const closes = /\*[.,!?:;'"]*$/.test(w);
        w = w.replace(/\*/g, "");
        const at = AUDIO_DELAY + (starts[bi] + (wi / Math.max(1, ws.length)) * shares[bi]) * spoken - rel;
        const out = { text: w, em, at: Math.max(0, Math.round(at)) };
        if (closes) em = false;
        return out;
      });
      placed.push({ beat, scene, sceneIndex: si, index: placed.length, from: start + rel, d, words, exit: "cut", last: false });
    });
    start += total;
  });
  placed.forEach((p, i) => {
    const next = placed[i + 1];
    p.exit = next ? next.beat.transition : "cut";
    p.last = !next;
  });
  return placed;
}
