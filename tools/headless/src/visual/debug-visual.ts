// F1 debug visualisation: runs a scenario on the real `createSim` (whatever movement it ships
// with), renders points + waypoint paths on a canvas 2D page with Playwright Chromium and
// writes docs/progress/fase-01/media/{f1-debug.gif,f1-debug.webm,f1-debug-first.png,
// f1-debug-last.png,bench.md}. Re-run after any movement change:
//   pnpm --filter @reinos/headless run debug-visual
// Uses ffmpeg when present (GIF + WebM from the PNG sequence); otherwise keeps the PNG
// sequence and records a WebM with Playwright's own video recorder.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { MAX_WAYPOINTS, ORDER_NONE, createSim } from '@reinos/sim';
import { DEFAULT_BENCH, benchEnv, benchMarkdown, runBench } from '../bench';
import { loadSimData } from '../replay-io';
import { generateScenario, type ScenarioOptions } from '../scenario';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const MEDIA = path.join(root, 'docs/progress/fase-01/media');
const SIDE_PX = 576;
const FRAME_EVERY_TURNS = 2;

/** Small scenario tuned to be readable on screen. */
const VISUAL: ScenarioOptions = {
  seed: 4,
  units: 120,
  turns: 260,
  mapSide: 96,
  obstaclePct: 22,
  groupMax: 30,
  cmdEvery: 25,
  pocketEvery: 3,
  checkpointEvery: 20,
};

interface UnitFrame {
  x: number;
  y: number;
  owner: number;
  active: number;
  /** Flattened waypoint list [x0, y0, x1, y1, ...] still to visit. */
  path: number[];
}
interface Frame {
  tick: number;
  units: UnitFrame[];
}

function decodeBlocked(rle: number[], n: number): number[] {
  const out = new Array<number>(n).fill(0);
  let i = 0;
  let cur = 0;
  for (const run of rle) {
    if (cur === 1) for (let k = 0; k < run; k++) out[i + k] = 1;
    i += run;
    cur ^= 1;
  }
  return out;
}

function simulate(): { frames: Frame[]; blocked: number[]; side: number } {
  const data = loadSimData();
  const { replay } = generateScenario(VISUAL, data);
  const sim = createSim(replay.seed, replay.dataVersion, replay.config, data);
  const w = sim.world;
  const frames: Frame[] = [];
  const byTurn = new Map(replay.turns.map((t) => [t.n, t.cmds]));
  for (let n = 0; n < replay.totalTurns; n++) {
    sim.step(byTurn.get(n) ?? []);
    if ((n + 1) % FRAME_EVERY_TURNS !== 0) continue;
    const units: UnitFrame[] = [];
    for (let i = 0; i < w.highWater; i++) {
      if (w.alive[i] === 0) continue;
      const path: number[] = [];
      const active = w.orderKind[i] !== ORDER_NONE ? 1 : 0;
      if (active === 1)
        for (
          let k = w.pathIdx[i] as number;
          k < (w.pathCount[i] as number) && k < MAX_WAYPOINTS;
          k++
        )
          path.push(w.wpX[i * MAX_WAYPOINTS + k] as number, w.wpY[i * MAX_WAYPOINTS + k] as number);
      units.push({
        x: w.posX[i] as number,
        y: w.posY[i] as number,
        owner: w.owner[i] as number,
        active,
        path,
      });
    }
    frames.push({ tick: sim.tick, units });
  }
  const side = replay.config.map.width;
  return {
    frames,
    blocked: decodeBlocked(replay.config.map.blockedRle, side * side),
    side,
  };
}

const PAGE = `<!doctype html><html><body style="margin:0;background:#111">
<canvas id="c" width="${SIDE_PX}" height="${SIDE_PX}"></canvas>
<script>
window.setup = (blocked, side) => { window.S = { blocked, side, k: ${SIDE_PX} / side }; };
window.draw = (f, total) => {
  const { blocked, side, k } = window.S;
  const c = document.getElementById('c').getContext('2d');
  c.fillStyle = '#1b1d22'; c.fillRect(0, 0, ${SIDE_PX}, ${SIDE_PX});
  c.fillStyle = '#505662';
  for (let i = 0; i < blocked.length; i++) if (blocked[i]) c.fillRect((i % side) * k, Math.floor(i / side) * k, k, k);
  const col = ['#4aa3ff', '#ff9b3d'];
  c.lineWidth = 1;
  for (const u of f.units) {
    if (!u.path.length) continue;
    c.strokeStyle = col[u.owner % 2] + '88';
    c.beginPath(); c.moveTo(u.x / 1000 * k, u.y / 1000 * k);
    for (let j = 0; j < u.path.length; j += 2) c.lineTo(u.path[j] / 1000 * k, u.path[j + 1] / 1000 * k);
    c.stroke();
    c.fillStyle = '#ffffffcc';
    for (let j = 0; j < u.path.length; j += 2) c.fillRect(u.path[j] / 1000 * k - 1, u.path[j + 1] / 1000 * k - 1, 2, 2);
  }
  for (const u of f.units) {
    c.fillStyle = col[u.owner % 2];
    c.beginPath(); c.arc(u.x / 1000 * k, u.y / 1000 * k, Math.max(2, 0.3 * k), 0, 6.2832); c.fill();
  }
  const act = f.units.filter((u) => u.active).length;
  c.fillStyle = '#fff'; c.font = '12px monospace';
  c.fillText('tick ' + f.tick + '/' + total + '  units ' + f.units.length + '  moving ' + act, 6, 14);
};
</script></body></html>`;

async function launch(): Promise<Browser> {
  const args = ['--no-sandbox'];
  const exe = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
  if (existsSync(chromium.executablePath())) return chromium.launch({ args });
  if (!existsSync(exe)) throw new Error('no Chromium found (set CHROMIUM_PATH)');
  return chromium.launch({ args, executablePath: exe });
}

const hasFfmpeg = (): boolean =>
  spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

async function main(): Promise<void> {
  mkdirSync(MEDIA, { recursive: true });
  const { frames, blocked, side } = simulate();
  const total = (frames[frames.length - 1] as Frame).tick;
  const ffmpeg = hasFfmpeg();
  const framesDir = ffmpeg
    ? mkdtempSync(path.join(os.tmpdir(), 'f1-frames-'))
    : path.join(MEDIA, 'frames');
  const videoDir = mkdtempSync(path.join(os.tmpdir(), 'f1-video-'));
  mkdirSync(framesDir, { recursive: true });

  const browser = await launch();
  const ctx = await browser.newContext({
    viewport: { width: SIDE_PX, height: SIDE_PX },
    ...(ffmpeg
      ? {}
      : { recordVideo: { dir: videoDir, size: { width: SIDE_PX, height: SIDE_PX } } }),
  });
  const page = await ctx.newPage();
  await page.setContent(PAGE);
  await page.evaluate(
    ([b, s]) =>
      (globalThis as unknown as { setup(b: number[], s: number): void }).setup(
        b as number[],
        s as number,
      ),
    [blocked, side] as const,
  );
  const canvas = page.locator('#c');
  for (let i = 0; i < frames.length; i++) {
    await page.evaluate(
      ([f, t]) =>
        (globalThis as unknown as { draw(f: unknown, t: number): void }).draw(f, t as number),
      [frames[i], total] as const,
    );
    const file = path.join(framesDir, 'frame' + String(i).padStart(4, '0') + '.png');
    await canvas.screenshot({ path: file });
    if (!ffmpeg) await page.waitForTimeout(50); // real time pacing for the Playwright video
  }
  const video = page.video();
  await ctx.close();
  await browser.close();

  const names = readdirSync(framesDir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  const first = path.join(framesDir, names[0] as string);
  const last = path.join(framesDir, names[names.length - 1] as string);
  if (ffmpeg) {
    const pattern = path.join(framesDir, 'frame%04d.png');
    const gif = path.join(MEDIA, 'f1-debug.gif');
    const run = (args: string[]): void => {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
    };
    run([
      '-framerate',
      '15',
      '-i',
      pattern,
      '-vf',
      'split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=none',
      '-loop',
      '0',
      gif,
    ]);
    run([
      '-framerate',
      '15',
      '-i',
      pattern,
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '0',
      '-crf',
      '36',
      '-pix_fmt',
      'yuv420p',
      path.join(MEDIA, 'f1-debug.webm'),
    ]);
    renameSync(first, path.join(MEDIA, 'f1-debug-first.png'));
    renameSync(last, path.join(MEDIA, 'f1-debug-last.png'));
    rmSync(framesDir, { recursive: true, force: true });
  } else if (video) {
    renameSync(await video.path(), path.join(MEDIA, 'f1-debug.webm'));
  }
  rmSync(videoDir, { recursive: true, force: true });
  console.log(
    'frames: ' + frames.length + '  ticks: ' + total + '  ffmpeg: ' + ffmpeg + '  -> ' + MEDIA,
  );

  // Benchmark table (plan F2): 400 and 1000 units.
  const rows = [400, 1000].map((u) => runBench({ ...DEFAULT_BENCH, units: u }, loadSimData()));
  const md = benchMarkdown(
    rows,
    benchEnv(),
    'pnpm --filter @reinos/headless run debug-visual',
    DEFAULT_BENCH,
  );
  writeFileSync(path.join(MEDIA, 'bench.md'), md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
