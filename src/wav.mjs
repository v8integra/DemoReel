import fs from 'node:fs';

/** Writes mono float samples (-1..1) as 16-bit PCM WAV. */
export function writeWav(file, samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

/** Reads a 16-bit PCM mono WAV written by writeWav. */
export function readWav(file) {
  const buf = fs.readFileSync(file);
  const rate = buf.readUInt32LE(24);
  let off = 12;
  while (off < buf.length - 8 && buf.toString('ascii', off, off + 4) !== 'data') off += 8 + buf.readUInt32LE(off + 4);
  const len = buf.readUInt32LE(off + 4) / 2;
  const samples = new Float32Array(len);
  for (let i = 0; i < len; i++) samples[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
  return { samples, rate };
}
