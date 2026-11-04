#!/usr/bin/env node
// DemoReel: node src/cli.mjs <cmd> <product> [name] [flags]
//   seed     <product>          build the demo data profile once (products/<p>/seed.mjs)
//   voice    <product> <name>   generate narration clips for a script
//   record   <product> <name>   drive the app and capture frames (needs voice first)
//   assemble <product> <name>   build the MP4 from the last recording
//   make     <product> <name>   voice + record + assemble
// <name> is a script (products/<p>/scripts/<name>.yaml) or a sequence (products/<p>/sequences/<name>.yaml).
// Flags: --keep-frames  keep captured frames after assembling
//        --from=N       sequences: re-record from part N on (earlier parts are reused)
//        --only=N       sequences: re-record just part N, then re-join
//        --join         sequences: just re-join the existing part videos
import fs from 'node:fs';
import path from 'node:path';
import { launchElectron, copyDir, root } from './launch.mjs';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.slice(2).split('=');
  return [k, v ?? true];
}));
const keepFrames = !!flags['keep-frames'];
const [cmd, productName, scriptName = 'overview'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!cmd || !productName) {
  console.log('usage: node src/cli.mjs <seed|voice|record|assemble|make> <product> [script|sequence] [--keep-frames] [--from=N] [--only=N] [--join]');
  process.exit(1);
}
const productDir = path.join(root, 'products', productName);
const product = (await import(pathUrl(path.join(productDir, 'product.mjs')))).default;
const seedProfile = path.join(root, 'work', productName, 'seed-profile');
const workDir = path.join(root, 'work', productName, scriptName);
const outBase = path.join(root, 'output', `${productName}-${scriptName}`);
const sequenceFile = path.join(productDir, 'sequences', `${scriptName}.yaml`);

function pathUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/');
}

async function loadScript() {
  const { loadScript } = await import('./script.mjs');
  const script = loadScript(path.join(productDir, 'scripts', `${scriptName}.yaml`));
  if (keepFrames) script.keepFrames = true;
  return script;
}

if (cmd === 'seed') {
  const { seed } = await import(pathUrl(path.join(productDir, 'seed.mjs')));
  fs.rmSync(seedProfile, { recursive: true, force: true });
  const { app, page } = await launchElectron(product, { userData: seedProfile });
  await page.waitForTimeout(2000);
  await seed(page);
  await app.close();
  console.log('seed profile ready: ' + seedProfile);
} else if (fs.existsSync(sequenceFile)) {
  if (cmd !== 'make') throw new Error(`${scriptName} is a sequence: use make (with --from=N, --only=N or --join).`);
  const { loadSequence } = await import('./script.mjs');
  const { makeSequence, joinSequence } = await import('./sequence.mjs');
  const seq = loadSequence(sequenceFile);
  const files = flags.join
    ? joinSequence(seq, workDir, outBase)
    : await makeSequence({ seq, product, workDir, seedProfile, outBase, from: Number(flags.from ?? 1), only: flags.only ? Number(flags.only) : null, keepFrames });
  console.log('done: ' + files.join(', '));
} else if (cmd === 'assemble') {
  const { assemble } = await import('./assemble.mjs');
  const script = await loadScript();
  console.log('done: ' + (await assemble(script, workDir, outBase)).join(', '));
} else if (cmd === 'voice' || cmd === 'make' || cmd === 'record') {
  const script = await loadScript();
  if (cmd !== 'record') {
    const { makeVoice } = await import('./voice.mjs');
    await makeVoice(script, workDir);
  }
  if (cmd !== 'voice') {
    const { record } = await import('./record.mjs');
    const userData = path.join(workDir, 'profile');
    // `start: fresh` films a brand-new install (first-run setup); `start: { from: 'getting-started/state-8' }`
    // starts from app data a sequence saved (work/<product>/...); otherwise the demo data is used.
    if (script.start === 'fresh') fs.rmSync(userData, { recursive: true, force: true });
    else if (script.start?.from) {
      const from = path.join(root, 'work', productName, script.start.from);
      if (!fs.existsSync(from)) throw new Error(`No saved app data at ${from}. Record that sequence first.`);
      copyDir(from, userData);
    } else {
      if (!fs.existsSync(seedProfile)) throw new Error(`No demo data yet. Run: node src/cli.mjs seed ${productName}`);
      copyDir(seedProfile, userData);
    }
    await record({ product, script, workDir, userData });
  }
  if (cmd === 'make') {
    const { assemble } = await import('./assemble.mjs');
    console.log('done: ' + (await assemble(script, workDir, outBase)).join(', '));
  }
} else {
  console.log('unknown command ' + cmd);
  process.exit(1);
}
