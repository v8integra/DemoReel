import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const DEFAULTS = {
  voice: 'af_heart',
  speed: 1,
  size: [1280, 720],
  scale: 1.5,
  output: [1920, 1080],
  fps: 30,
  captions: true,
  // Seconds of quiet before each line and after the last step / line of a scene.
  lead: 0.35,
  tail: 0.5,
};

/** Reads a scene script (YAML). Each scene: optional `card`, `say` (narration) and `steps`. */
export function loadScript(file, defaults = {}) {
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  const script = { ...DEFAULTS, ...defaults, ...raw, file, dir: path.dirname(file) };
  if (!Array.isArray(script.scenes) || !script.scenes.length) throw new Error(`${file}: no scenes`);
  script.scenes = script.scenes.map((s, i) => {
    const scene = { steps: [], ...s, index: i };
    scene.say = (scene.say ?? '').replace(/\s+/g, ' ').trim();
    if (!Array.isArray(scene.steps)) throw new Error(`${file}: scene ${i + 1} steps must be a list`);
    return scene;
  });
  return script;
}

/**
 * Reads a sequence (YAML): several scripts ("parts") recorded one after another, each starting
 * from the app data the previous part left behind, then joined into one video with chapters.
 */
export function loadSequence(file) {
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw.parts) || !raw.parts.length) throw new Error(`${file}: no parts`);
  const scriptsDir = path.join(path.dirname(file), '..', 'scripts');
  const parts = raw.parts.map((p) => {
    const name = typeof p === 'string' ? p : p.script;
    const script = loadScript(path.join(scriptsDir, `${name}.yaml`), raw.defaults ?? {});
    return { name, chapter: script.chapter ?? script.title ?? name, script };
  });
  return { start: 'fresh', ...raw, file, parts };
}

/** Splits narration into caption-sized sentences. */
export function sentences(text) {
  return (text.match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
}
