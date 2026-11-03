import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { readWav, writeWav } from './wav.mjs';

const RATE = 24_000;

/** Builds <outBase>.mp4, .srt, -thumbnail.png and -youtube.txt from a recording. */
export async function assemble(script, workDir, outBase) {
  const tl = JSON.parse(fs.readFileSync(path.join(workDir, 'timeline.json'), 'utf8'));
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  const [ow, oh] = script.output;

  // Frames arrive only when the screen changes, so each one is held until the next.
  const list = [];
  // Open on the last frame from before filming started, then everything filmed, in time order.
  // (Recordings made before the timing fix stamped pre-start frames far past the end: dropped.)
  const sorted = tl.frames.filter((f) => f.t <= tl.duration).sort((a, b) => a.t - b.t);
  const opening = sorted.filter((f) => f.t <= 0).at(-1);
  const frames = [...(opening ? [{ ...opening, t: 0 }] : []), ...sorted.filter((f) => f.t > 0)];
  if (!frames.length) throw new Error('No frames were recorded.');
  frames[0] = { ...frames[0], t: 0 };
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : tl.duration;
    list.push(`file '${path.join(workDir, 'frames', frames[i].file).replace(/\\/g, '/')}'`, `duration ${Math.max(0.001, next - frames[i].t).toFixed(4)}`);
  }
  list.push(`file '${path.join(workDir, 'frames', frames.at(-1).file).replace(/\\/g, '/')}'`);
  const listFile = path.join(workDir, 'frames.txt');
  fs.writeFileSync(listFile, list.join('\n'));

  // Narration: every clip placed at the moment it was "spoken" during recording.
  const track = new Float32Array(Math.ceil((tl.duration + 0.5) * RATE));
  for (const v of tl.voice) {
    const { samples, rate } = readWav(v.file);
    if (rate !== RATE) throw new Error(`${v.file}: expected ${RATE} Hz`);
    const at = Math.round(v.t * RATE);
    for (let i = 0; i < samples.length && at + i < track.length; i++) track[at + i] += samples[i] * (script.volume ?? 0.95);
  }
  const audioFile = path.join(workDir, 'narration.wav');
  writeWav(audioFile, track, RATE);

  const mp4 = `${outBase}.mp4`;
  const fade = Math.min(0.6, tl.duration / 10);
  run([
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-i', audioFile,
    '-vf', `scale=${ow}:${oh}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${script.fps},fade=t=in:d=${fade},fade=t=out:st=${(tl.duration - fade).toFixed(2)}:d=${fade},format=yuv420p`,
    '-af', `afade=t=out:st=${(tl.duration - fade).toFixed(2)}:d=${fade}`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', tl.duration.toFixed(3), mp4,
  ]);

  // Captions as a separate file: YouTube takes it as subtitles (better than burned-in text for search and accessibility).
  const srt = `${outBase}.srt`;
  fs.writeFileSync(srt, tl.captions.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));

  const thumb = `${outBase}-thumbnail.png`;
  run(['-y', '-ss', String(script.thumbnailAt ?? 1.5), '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:720', thumb]);

  const files = [mp4, srt, thumb];
  if (script.youtube) {
    const yt = `${outBase}-youtube.txt`;
    const y = script.youtube;
    fs.writeFileSync(yt, [`Title: ${y.title ?? script.title ?? ''}`, '', 'Description:', (y.description ?? '').trim(), '', `Tags: ${(y.tags ?? []).join(', ')}`, ''].join('\n'));
    files.push(yt);
  }
  if (!script.keepFrames) fs.rmSync(path.join(workDir, 'frames'), { recursive: true, force: true });
  return files;
}

function stamp(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

function run(args) {
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (err) {
    throw new Error(`ffmpeg failed (${err.status})`);
  }
}
