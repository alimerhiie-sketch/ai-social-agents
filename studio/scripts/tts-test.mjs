import { KokoroTTS } from "kokoro-js";

const t0 = Date.now();
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
console.log("model loaded", (Date.now() - t0) / 1000, "s");
const t1 = Date.now();
const audio = await tts.generate("ChatGPT can now spend your money. Here's what actually protects you.", { voice: "af_heart", speed: 1.05 });
await audio.save(process.argv[2]);
console.log("generated", (Date.now() - t1) / 1000, "s · samples", audio.audio.length, "· rate", audio.sampling_rate);
