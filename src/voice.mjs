import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sentences } from './script.mjs';
import { readWav, writeWav } from './wav.mjs';

let tts;
async function engine() {
  if (!tts) {
    const { KokoroTTS } = await import('kokoro-js');
    // Runs on the CPU, fully offline after the first model download (~90 MB, cached by transformers.js).
    tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  }
  return tts;
}

/**
 * Generates one narration clip per sentence (so captions can follow the voice) and writes
 * voice/manifest.json: scenes[i].lines = [{ text, file, seconds }]. Unchanged lines are reused.
 */
export async function makeVoice(script, workDir) {
  const dir = path.join(workDir, 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { scenes: [] };
  for (const scene of script.scenes) {
    const lines = [];
    for (const text of sentences(scene.say)) {
      const key = crypto.createHash('sha1').update(`${script.voice}|${script.speed}|${text}`).digest('hex').slice(0, 16);
      const file = path.join(dir, `${key}.wav`);
      if (!fs.existsSync(file)) {
        const t = Date.now();
        const audio = await (await engine()).generate(spokenForm(text, script.pronounce), { voice: script.voice, speed: script.speed });
        writeWav(file, trimSilence(audio.audio, audio.sampling_rate), audio.sampling_rate);
        console.log(`voice: "${text.slice(0, 60)}" (${((Date.now() - t) / 1000).toFixed(1)} s)`);
      }
      const { samples, rate } = readWav(file);
      lines.push({ text, file, seconds: samples.length / rate });
    }
    manifest.scenes.push({ lines });
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const total = manifest.scenes.flatMap((s) => s.lines).reduce((a, l) => a + l.seconds, 0);
  console.log(`voice ready: ${total.toFixed(1)} s of narration`);
  return manifest;
}

/** Applies the script's `pronounce` map (e.g. { "AI": "A.I." }) to the text the voice reads. */
function spokenForm(text, pronounce = {}) {
  let out = text;
  for (const [from, to] of Object.entries(pronounce)) out = out.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), to);
  return out;
}

/** Cuts leading and trailing near-silence so scene timing is exact. */
function trimSilence(samples, rate, threshold = 0.01) {
  let a = 0;
  let b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < threshold) a++;
  while (b > a && Math.abs(samples[b]) < threshold) b--;
  const pad = Math.round(rate * 0.04);
  return samples.subarray(Math.max(0, a - pad), Math.min(samples.length, b + pad));
}
