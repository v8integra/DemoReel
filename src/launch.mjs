import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Starts an Electron product with a throwaway data folder and returns { app, page }.
 * `product.launch` gives the electron binary, the app folder, env and extra args.
 */
export async function launchElectron(product, { userData, scale = 1 } = {}) {
  const l = product.launch;
  fs.mkdirSync(userData, { recursive: true });
  const app = await electron.launch({
    executablePath: l.electron,
    args: [l.appDir, `--force-device-scale-factor=${scale}`, ...(l.args ?? [])],
    env: { ...process.env, ...l.env(userData) },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/**
 * Sets the window's content area to an exact size (in CSS pixels). At a forced scale factor the
 * window can be larger than the screen; Windows allows that when it is placed at 0,0 first.
 */
export async function sizeWindow(app, width, height) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setMinimumSize(200, 200);
    win.setBounds({ x: 0, y: 0, width: w + 20, height: h + 80 });
    win.setContentSize(w, h);
  }, [width, height]);
}

export function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
