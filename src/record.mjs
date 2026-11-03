import fs from 'node:fs';
import path from 'node:path';
import { launchElectron, sizeWindow, root } from './launch.mjs';

const now = () => performance.now() / 1000;
const sleep = (s) => new Promise((r) => setTimeout(r, Math.max(0, s * 1000)));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Drives the app through the script while Chromium streams frames of the window.
 * Writes <workDir>/frames/*.jpg and timeline.json (frame times, narration and caption times).
 */
export async function record({ product, script, workDir, userData }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(workDir, 'voice', 'manifest.json'), 'utf8'));
  const [w, h] = script.size;
  const framesDir = path.join(workDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  // Keep painting even when other windows cover this one, so recording works in the background.
  const launchProduct = { ...product, launch: { ...product.launch, args: [...(product.launch.args ?? []), '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] } };
  const { app, page } = await launchElectron(launchProduct, { userData, scale: script.scale });
  try {
    await sizeWindow(app, w, h);
    await page.waitForTimeout(1500);
    const [vw, vh] = await page.evaluate(() => [innerWidth, innerHeight]);
    if (vw !== w || vh !== h) console.warn(`warning: window content is ${vw}x${vh}, not ${w}x${h} (screen too small at scale ${script.scale}); the video is scaled to fit`);
    await page.evaluate(fs.readFileSync(path.join(root, 'src', 'overlay.js'), 'utf8'));
    if (script.css || script.captionStyle) await page.evaluate((o) => window.__demoreel.style(o), { css: script.css, caption: script.captionStyle });
    if (script.openFiles?.length) await standInFilePicker(app, script.openFiles.map((f) => path.resolve(script.dir, f)));
    if (script.setup) await runSteps(page, script.setup, { mouse: { x: vw / 2, y: vh / 2 } }, script);

    // Filmed time: wall time minus the stretches a `skip` step cut out. Frames that arrive before
    // filming starts get negative times; the assembler opens on the last of them.
    let t0 = now() + 3600;
    let pausedTotal = 0;
    let pausedAt = null;
    const film = () => (pausedAt ?? now()) - t0 - pausedTotal;

    const frames = [];
    const writes = [];
    const cdp = await page.context().newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      if (pausedAt !== null) return;
      const file = `${String(frames.length).padStart(6, '0')}.jpg`;
      frames.push({ file, t: film() });
      writes.push(fs.promises.writeFile(path.join(framesDir, file), Buffer.from(data, 'base64')));
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(vw * script.scale), maxHeight: Math.round(vh * script.scale), everyNthFrame: 1 });
    // A tiny visible change forces the first frame immediately.
    await page.evaluate(() => window.__demoreel.caption(''));
    await sleep(0.5);

    const startedAt = now();
    for (const f of frames) f.t += t0 - startedAt;
    t0 = startedAt;
    const voice = [];
    const captions = [];
    const ctx = {
      mouse: { x: vw * 0.62, y: vh * 0.55 },
      speaking: Promise.resolve(),
      pause: () => { pausedAt = now(); },
      resume: () => { pausedTotal += now() - pausedAt; pausedAt = null; },
    };
    await page.mouse.move(ctx.mouse.x, ctx.mouse.y);
    const scenes = script.introCard ? [{ index: -1, say: '', steps: [], card: script.introCard, hold: 1.4 }, { index: -2, say: '', steps: [], card: null }, ...script.scenes] : script.scenes;

    for (const scene of scenes) {
      const start = now();
      const lines = scene.index >= 0 ? (manifest.scenes[scene.index]?.lines ?? []) : [];
      if (lines.map((l) => l.text).join(' ') !== sentencesKey(scene)) throw new Error(`Narration for scene ${scene.index + 1} is out of date. Run voice first.`);
      if ('card' in scene) await page.evaluate((c) => window.__demoreel.card(c), scene.card ? cardData(scene.card, script) : null);

      // Narration and captions run on a timer while the steps run.
      const speaking = (async () => {
        let t = start + script.lead;
        for (const line of lines) {
          await sleep(t - now());
          voice.push({ file: line.file, t: film() });
          const shown = { text: line.text, start: film(), end: 0 };
          if (script.captions) await page.evaluate((s) => window.__demoreel.caption(s), line.text).catch(() => {});
          await sleep(line.seconds);
          shown.end = film();
          captions.push(shown);
          t = now() + 0.18;
        }
        if (script.captions && lines.length) await page.evaluate(() => window.__demoreel.caption('')).catch(() => {});
        return now();
      })();
      ctx.speaking = speaking;
      const stepsEnd = runSteps(page, scene.steps, ctx, script).then(now);
      const [talkEnd, actEnd] = await Promise.all([speaking, stepsEnd]);
      if (actEnd > talkEnd + 1.5 && !ctx.skipped) console.warn(`scene ${scene.index + 1}: steps ran ${(actEnd - talkEnd).toFixed(1)} s past the narration`);
      ctx.skipped = false;
      await sleep(script.tail + (scene.hold ?? 0));
      if (scene.index >= 0) console.log(`scene ${scene.index + 1}/${script.scenes.length} done (${(now() - start).toFixed(1)} s)`);
    }
    const end = film();
    await cdp.send('Page.stopScreencast');
    await Promise.all(writes);

    const timeline = {
      size: [Math.round(vw * script.scale), Math.round(vh * script.scale)],
      duration: end,
      frames,
      voice,
      captions: captions.sort((a, b) => a.start - b.start),
    };
    fs.writeFileSync(path.join(workDir, 'timeline.json'), JSON.stringify(timeline));
    console.log(`recorded ${end.toFixed(1)} s, ${frames.length} frames`);
    return timeline;
  } finally {
    await app.close().catch(() => {});
  }
}

/**
 * Windows' file dialogs can't be filmed or clicked, so "Open" dialogs return the script's demo
 * files instead, one per dialog, in order (the last one repeats).
 */
async function standInFilePicker(app, files) {
  await app.evaluate(({ dialog }, list) => {
    let i = 0;
    const next = () => list[Math.min(i++, list.length - 1)];
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [next()] });
    dialog.showOpenDialogSync = () => [next()];
  }, files);
}

function laterLabel(seconds) {
  if (seconds < 20) return 'A few seconds later';
  if (seconds < 90) return 'A minute later';
  return `${Math.round(seconds / 60)} minutes later`;
}

/** Title card images are files next to the script; the page gets them as data URLs. */
function cardData(card, script) {
  if (!card?.image || card.image.startsWith('data:')) return card;
  const file = path.resolve(script.dir, card.image);
  const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { ...card, image: `data:${type};base64,${fs.readFileSync(file).toString('base64')}` };
}

function sentencesKey(scene) {
  return scene.say.replace(/\s+/g, ' ').trim();
}

const loc = (page, sel) => page.locator(sel).first();

async function moveTo(page, ctx, sel, script) {
  const l = loc(page, sel);
  await l.waitFor({ state: 'visible', timeout: 10_000 });
  await l.scrollIntoViewIfNeeded();
  const box = await l.boundingBox();
  if (!box) throw new Error(`Can't find ${sel} on screen`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const from = { ...ctx.mouse };
  const dist = Math.hypot(x - from.x, y - from.y);
  const seconds = Math.min(0.9, 0.3 + dist / 1800) / (script.pace ?? 1);
  const n = Math.max(8, Math.round(seconds * 60));
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await sleep(seconds / n);
  }
  ctx.mouse = { x, y };
  return l;
}

async function rectOf(page, sel) {
  const l = loc(page, sel);
  await l.waitFor({ state: 'visible', timeout: 10_000 });
  return l.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

/** Runs scene steps in order. See README for the step list. */
export async function runSteps(page, steps, ctx, script) {
  for (const step of steps) {
    const [kind, arg] = typeof step === 'string' ? [step, true] : Object.entries(step)[0];
    switch (kind) {
      case 'wait':
        await sleep(Number(arg));
        break;
      case 'nav': {
        const sel = `nav >> text="${arg}"`;
        const target = (await page.locator(sel).count()) ? sel : `text="${arg}"`;
        const item = loc(page, target);
        // A sidebar hidden by script CSS (portrait videos) is clicked without moving the cursor.
        if (await item.isVisible()) await (await moveTo(page, ctx, target, script)).click();
        else await item.dispatchEvent('click');
        await sleep(0.6);
        break;
      }
      case 'hover':
      case 'move':
        await moveTo(page, ctx, arg, script);
        await sleep(0.25);
        break;
      case 'click':
        await sleep(0.1);
        await (await moveTo(page, ctx, arg, script)).click();
        await sleep(0.45);
        break;
      case 'type': {
        // `text` may be a list: each entry is typed and confirmed with Enter (tag inputs).
        const l = await moveTo(page, ctx, arg.into, script);
        await l.click();
        if (arg.clear) await l.fill('');
        const entries = Array.isArray(arg.text) ? arg.text : [arg.text];
        for (const text of entries) {
          await l.pressSequentially(String(text), { delay: arg.delay ?? 45 });
          if (Array.isArray(arg.text) || arg.enter) {
            await sleep(arg.pick ?? 0.15);
            await l.press('Enter');
            await sleep(0.2);
          }
        }
        await sleep(0.3);
        break;
      }
      case 'waitFor': {
        const a = typeof arg === 'string' ? { sel: arg } : arg;
        await loc(page, a.sel).waitFor({ state: 'visible', timeout: (a.timeout ?? 60) * 1000 });
        await sleep(0.3);
        break;
      }
      case 'clickAll': {
        // Clicks each matching control in turn (e.g. every "Approve"), re-finding it after each click.
        const a = typeof arg === 'string' ? { sel: arg } : arg;
        for (let n = 0; n < (a.max ?? 20); n++) {
          if (!(await loc(page, a.sel).isVisible().catch(() => false))) break;
          await (await moveTo(page, ctx, a.sel, script)).click();
          await sleep(a.gap ?? 0.5);
        }
        break;
      }
      case 'skip': {
        // Cuts out a long wait (an AI run, a download): filming pauses until `until` appears.
        const a = typeof arg === 'string' ? { until: arg } : arg;
        await ctx.speaking;
        await sleep(0.3);
        ctx.pause();
        const started = now();
        try {
          await loc(page, a.until).waitFor({ state: 'visible', timeout: (a.timeout ?? 900) * 1000 });
          await sleep(a.settle ?? 0.6);
        } finally {
          ctx.resume();
        }
        ctx.skipped = true;
        const took = now() - started;
        console.log(`skipped ${took.toFixed(0)} s of waiting`);
        await page.evaluate((t) => window.__demoreel.badge(t), `⏩  ${a.label ?? laterLabel(took)}`);
        await sleep(1.8);
        await page.evaluate(() => window.__demoreel.badge(null));
        break;
      }
      case 'select': {
        // Native dropdown lists draw outside the page, so the choice is made directly.
        const l = await moveTo(page, ctx, arg.in, script);
        await sleep(0.3);
        await l.selectOption(String(arg.value));
        await sleep(0.5);
        break;
      }
      case 'press':
        await page.keyboard.press(String(arg));
        await sleep(0.3);
        break;
      case 'scroll': {
        // Wheel scrolling under the cursor, in small steps, the way a person scrolls.
        const total = typeof arg === 'number' ? arg : arg.by;
        if (typeof arg === 'object' && arg.over) await moveTo(page, ctx, arg.over, script);
        const n = Math.max(6, Math.round(Math.abs(total) / 25));
        for (let i = 0; i < n; i++) {
          await page.mouse.wheel(0, total / n);
          await sleep(0.016);
        }
        await sleep(0.4);
        break;
      }
      case 'zoom': {
        const on = typeof arg === 'string' ? arg : arg.on;
        const scale = typeof arg === 'string' ? 1.5 : (arg.scale ?? 1.5);
        await page.evaluate(([r, s]) => window.__demoreel.zoom(r, s), [await rectOf(page, on), scale]);
        await sleep(1);
        break;
      }
      case 'unzoom':
        await page.evaluate(() => window.__demoreel.zoom(null));
        await sleep(1);
        break;
      case 'ring':
        await page.evaluate((r) => window.__demoreel.ring(r), arg && arg !== 'off' ? await rectOf(page, arg) : null);
        await sleep(0.4);
        break;
      case 'card':
        await page.evaluate((c) => window.__demoreel.card(c), arg && arg !== 'off' ? cardData(arg, script) : null);
        await sleep(0.6);
        break;
      case 'eval':
        await page.evaluate(String(arg));
        break;
      default:
        throw new Error(`Unknown step "${kind}"`);
    }
  }
}
