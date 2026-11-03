import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { copyDir } from './launch.mjs';
import { makeVoice } from './voice.mjs';
import { record } from './record.mjs';
import { assemble } from './assemble.mjs';

/**
 * Records a sequence part by part. Part i starts from the app data part i-1 ended with
 * (work/.../state-<i-1>), so one part can be re-recorded without redoing the ones before it.
 * Then joins the part videos, captions and chapter list into one upload.
 *
 * opts.from: first part to (re)record, 1-based; earlier parts reuse their existing videos.
 * opts.only: re-record just this part.
 */
export async function makeSequence({ seq, product, workDir, seedProfile, outBase, from = 1, only = null, keepFrames = false }) {
  const n = seq.parts.length;
  const first = only ?? from;
  const last = only ?? n;
  for (let i = first; i <= last; i++) {
    const part = seq.parts[i - 1];
    const script = part.script;
    if (keepFrames) script.keepFrames = true;
    // Each part opens on a short chapter card unless the part has its own (or `introCard: false`).
    if (seq.chapterCards !== false && script.introCard === undefined) {
      script.introCard = { title: part.chapter, subtitle: `Part ${i} of ${n}`, image: seq.chapterImage && path.resolve(path.dirname(seq.file), seq.chapterImage) };
    }
    const dir = path.join(workDir, `part-${i}`);
    const startState = i === 1 ? null : path.join(workDir, `state-${i - 1}`);
    if (startState && !fs.existsSync(startState)) throw new Error(`Part ${i - 1} hasn't been recorded yet (no ${startState}). Record from part ${i - 1}.`);
    const userData = path.join(dir, 'profile');
    if (startState) copyDir(startState, userData);
    else if (seq.start === 'seed') copyDir(seedProfile, userData);
    else fs.rmSync(userData, { recursive: true, force: true });

    console.log(`\n== part ${i}/${n}: ${part.chapter}`);
    await makeVoice(script, dir);
    await record({ product, script, workDir: dir, userData });
    copyDir(userData, path.join(workDir, `state-${i}`));
    await assemble(script, dir, path.join(dir, 'video'));
  }
  return joinSequence(seq, workDir, outBase);
}

export function joinSequence(seq, workDir, outBase) {
  const parts = seq.parts.map((p, i) => {
    const dir = path.join(workDir, `part-${i + 1}`);
    const video = path.join(dir, 'video.mp4');
    if (!fs.existsSync(video)) throw new Error(`Part ${i + 1} has no video yet.`);
    return { ...p, dir, video, duration: probeDuration(video), srt: fs.readFileSync(path.join(dir, 'video.srt'), 'utf8') };
  });
  fs.mkdirSync(path.dirname(outBase), { recursive: true });

  // Every part is encoded the same way, so they join without re-encoding.
  const list = path.join(workDir, 'parts.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.video.replace(/\\/g, '/')}'`).join('\n'));
  const mp4 = `${outBase}.mp4`;
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  // Captions and chapters, shifted by each part's start time.
  let offset = 0;
  let k = 0;
  const srt = [];
  const chapters = [];
  for (const p of parts) {
    chapters.push(`${clock(offset)} ${p.chapter}`);
    for (const block of p.srt.trim().split(/\n\s*\n/)) {
      const [, times, ...text] = block.split('\n');
      if (!times) continue;
      const [a, b] = times.split(' --> ').map((t) => fromStamp(t) + offset);
      srt.push(`${++k}\n${stamp(a)} --> ${stamp(b)}\n${text.join('\n')}\n`);
    }
    offset += p.duration;
  }
  fs.writeFileSync(`${outBase}.srt`, srt.join('\n'));
  fs.copyFileSync(path.join(parts[0].dir, 'video-thumbnail.png'), `${outBase}-thumbnail.png`);

  const y = seq.youtube ?? {};
  fs.writeFileSync(`${outBase}-youtube.txt`, [`Title: ${y.title ?? seq.title ?? ''}`, '', 'Description:', (y.description ?? '').trim(), '', 'Chapters:', ...chapters, '', `Tags: ${(y.tags ?? []).join(', ')}`, ''].join('\n'));
  console.log(`\njoined ${parts.length} parts: ${clock(offset)} total\n${chapters.join('\n')}`);
  return [mp4, `${outBase}.srt`, `${outBase}-thumbnail.png`, `${outBase}-youtube.txt`];
}

function probeDuration(file) {
  // ffmpeg prints the duration on stderr when given no output.
  let text = '';
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    text = String(err.stderr);
  }
  const m = text.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`Can't read the length of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** YouTube chapter time: m:ss or h:mm:ss. */
function clock(s) {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor(t / 60) % 60;
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

function fromStamp(t) {
  const [h, m, rest] = t.trim().split(':');
  const [s, ms] = rest.split(',');
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function stamp(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}
