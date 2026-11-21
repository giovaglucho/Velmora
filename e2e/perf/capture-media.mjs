// Q4/F1 — devlog media for Fase 2 (K6). `pnpm media:render` (needs a built client: `VITE_ENABLE_DEBUG=1 pnpm --filter @reinos/client build`).
// Drives the integrated client (?scenario=demo200&debug=1: 100 OWN units per player) in Chromium + SwiftShader at
// 1920x1080 (DPR 1) and writes iso-z0.6/z1/z1.4, fog, minimap PNGs and select-move-100.gif into
// docs/progress/fase-02/media/. The GIF uses ffmpeg (palette) over screenshots with their real timestamps.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, 'docs/progress/fase-02/media');
const PORT = Number(process.env.MEDIA_PORT ?? 4176);
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.CHROMIUM_PATH ?? (fs.existsSync(PREINSTALLED) ? PREINSTALLED : undefined);
const FLAGS = [
  '--no-sandbox',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const VIEW = { width: 1920, height: 1080 };
const SCENARIO = process.env.MEDIA_SCENARIO ?? 'demo200';

async function startPreview() {
  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@reinos/client',
      'exec',
      'vite',
      'preview',
      '--port',
      String(PORT),
      '--strictPort',
    ],
    {
      stdio: 'ignore',
      detached: true,
    },
  );
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { child, url };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error('vite preview did not start');
}

async function open(browser, url) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message') && m.text().includes('Performance')) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?scenario=${SCENARIO}&debug=1`);
  await page.waitForFunction(() => window.__reinos?.ready === true, undefined, { timeout: 60_000 });
  return { ctx, page, errors };
}

/** Centres the camera on the centroid of the own units and sets the zoom index (no animation). */
const frameOwn = (page, zoomIndex, shift = [0, 0]) =>
  page.evaluate(
    ([zi, sh]) => {
      const r = window.__reinos;
      const own = r.units().filter((u) => u.owner === 0);
      const c = r.camera;
      const z = c.zoomT;
      const cx = own.reduce((t, u) => t + u.sx, 0) / own.length;
      const cy = own.reduce((t, u) => t + u.sy, 0) / own.length;
      r.camera = {
        x: c.x + (cx - window.innerWidth / 2) / z + sh[0],
        y: c.y + (cy - window.innerHeight / 2) / z + sh[1],
        zoomIndex: zi,
        zoomT: 0,
      };
    },
    [zoomIndex, shift],
  );
const ownUnits = (page) =>
  page.evaluate(() => window.__reinos.units().filter((u) => u.owner === 0));

async function boxSelect(page, units, view = VIEW) {
  const xs = units.map((u) => u.sx);
  const ys = units.map((u) => u.sy);
  // Keep the drag clear of the HUD: the minimap host is at the bottom right, so do not end the box over it.
  const pad = 30;
  await page.mouse.move(
    Math.max(4, Math.min(...xs) - pad),
    Math.max(50, Math.min(...ys) - pad - 30),
  );
  await page.mouse.down();
  await page.mouse.move(
    Math.min(view.width - 4, Math.max(...xs) + pad),
    Math.min(view.height - 140, Math.max(...ys) + pad),
    { steps: 10 },
  );
  await page.mouse.up();
}

async function stills(browser, url) {
  const { ctx, page, errors } = await open(browser, url);
  const shot = (name) => page.screenshot({ path: path.join(MEDIA, name) });
  // 1) zoom 0.6, nothing selected
  await frameOwn(page, 0);
  await page.waitForTimeout(800);
  await shot('iso-z0.6.png');
  // 2) zoom 1 with the 100 own units selected (box)
  await frameOwn(page, 1);
  await page.waitForTimeout(800);
  await boxSelect(page, await ownUnits(page));
  const sel1 = await page.evaluate(() => window.__reinos.selection().length);
  await page.waitForTimeout(600);
  await shot('iso-z1.png');
  // 3) zoom 1.4 (same selection)
  await frameOwn(page, 2);
  await page.waitForTimeout(800);
  await shot('iso-z1.4.png');
  // 4) march the army ~25 tiles in two legs (camera follows) so there is explored trail + visible area + unexplored; zoom 0.6
  for (let leg = 0; leg < 2; leg++) {
    await frameOwn(page, 0);
    await page.waitForTimeout(500);
    await page.mouse.click(1750, 560, { button: 'right' });
    await page.waitForTimeout(16_000);
  }
  await frameOwn(page, 0, [-380, -180]);
  await page.waitForTimeout(1000);
  await shot('fog.png');
  await page.getByTestId('minimap-host').screenshot({ path: path.join(MEDIA, 'minimap.png') });
  const info = await page.evaluate(() => {
    const r = window.__reinos;
    return {
      assets: r.assets,
      tick: r.tick,
      selected: r.selection().length,
      units: r.units().length,
    };
  });
  await ctx.close();
  return { sel1, info, errors };
}

async function gif(browser, url) {
  const view = { width: 1280, height: 720 };
  const vdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-'));
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // Playwright's own video recorder needs a downloaded ffmpeg build; CDP screencast + system ffmpeg does not.
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    const file = path.join(vdir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp * 1000 });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  const errors = [];
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message') && m.text().includes('Performance')) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?scenario=${SCENARIO}&debug=1`);
  await page.waitForFunction(() => window.__reinos?.ready === true, undefined, { timeout: 60_000 });
  await frameOwn(page, 0);
  await page.waitForTimeout(1500);
  const units = await ownUnits(page);
  if (!process.env.NOCAST)
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
  const tStart = Date.now();
  await page.waitForTimeout(800); // idle, before the box
  await boxSelect(page, units, view);
  await page
    .waitForFunction(() => window.__reinos.selection().length > 0, undefined, { timeout: 8000 })
    .catch(() => undefined);
  const count = await page.evaluate(() => window.__reinos.selection().length);
  await page.waitForTimeout(1200);
  await page.mouse.click(1000, 330, { button: 'right' });
  await page.waitForTimeout(7000);
  const tEnd = Date.now();
  if (!process.env.NOCAST) await cdp.send('Page.stopScreencast');
  const moved = await ownUnits(page);
  await ctx.close();
  if (!process.env.NOCAST && frames.length < 5)
    throw new Error(`screencast produced only ${frames.length} frames`);
  if (process.env.NOCAST)
    return {
      selected: count,
      meanSxBefore: Math.round(units.reduce((t, u) => t + u.sx, 0) / units.length),
      meanSxAfter: Math.round(moved.reduce((t, u) => t + u.sx, 0) / moved.length),
    };
  const lines = [];
  frames.forEach((f, i) => {
    lines.push(
      `file '${f.file}'`,
      `duration ${Math.max(0.02, ((frames[i + 1]?.t ?? f.t + 100) - f.t) / 1000).toFixed(3)}`,
    );
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  const list = path.join(vdir, 'list.txt');
  fs.writeFileSync(list, lines.join('\n'));
  const dur = (tEnd - tStart) / 1000;
  const out = path.join(MEDIA, 'select-move-100.gif');
  const vf =
    'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-vf',
      vf,
      '-loop',
      '0',
      out,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error('ffmpeg gif failed: ' + r.stderr);
  const webm = path.join(MEDIA, 'select-move-100.webm');
  const w = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-vf',
      'fps=20',
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '0',
      '-crf',
      '36',
      '-an',
      webm,
    ],
    { encoding: 'utf8' },
  );
  if (w.status !== 0) throw new Error('ffmpeg webm failed: ' + w.stderr);
  fs.rmSync(vdir, { recursive: true, force: true });
  const mean = (a) => a.reduce((t, u) => t + u.sx, 0) / a.length;
  return {
    selected: count,
    own: units.length,
    seconds: dur,
    frames: frames.length,
    gifMB: fs.statSync(out).size / 1e6,
    webmMB: fs.statSync(webm).size / 1e6,
    meanSxBefore: Math.round(mean(units)),
    meanSxAfter: Math.round(mean(moved)),
    errors,
  };
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });
  const { child, url } = await startPreview();
  const browser = await chromium.launch({ executablePath, args: FLAGS });
  try {
    const s = await stills(browser, url);
    console.log('stills', JSON.stringify(s));
    const g = await gif(browser, url);
    console.log('gif', JSON.stringify(g));
  } finally {
    await browser.close();
    try {
      process.kill(-child.pid);
    } catch {
      child.kill();
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
