// e2e/dev harness for the render lane (R2/R3): a fixed terrain + N fake units scene, no worker/UI.
// Query params: units, moving(0|1), loop(0|1), gx, gy, zoom(0..2), w, h, ctl(1 = hard-tile control),
// bg(hex), select(N own units), seed, markerX/markerY.
// Exposes window.__renderHarness for Playwright (separate from the final window.__reinos API of Q1).
import { gridToWorld, worldToScreen } from '../iso';
import { createRenderer, type Renderer } from '../renderer';
import { ZOOMS } from '../constants';
import { createFakeFeed, type FakeFeed } from './fakeFeed';
import { buildTerrainMap } from '../terrain/terrainMap';
import type { ZoomIndex } from '../types';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = q.get(k);
  return v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v);
};

const MAP = 128;
/** Lakes/forest stand-ins (blocked tiles) as alternating RLE, FREE first (SimConfig.map.blockedRle format). */
function demoBlockedRle(w: number, h: number): number[] {
  const rects: Array<[number, number, number, number]> = [
    [20, 24, 14, 10],
    [90, 30, 12, 16],
    [30, 92, 18, 12],
    [96, 96, 10, 10],
  ];
  const mask = new Uint8Array(w * h);
  for (const [x0, y0, rw, rh] of rects)
    for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) mask[y * w + x] = 1;
  const rle: number[] = [];
  let cur = 0;
  let run = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === cur) run++;
    else {
      rle.push(run);
      cur = mask[i] ?? 0;
      run = 1;
    }
  }
  rle.push(run);
  return rle;
}

export interface RenderHarness {
  ready: boolean;
  renderer: Renderer;
  feed: FakeFeed;
  /** Sets camera (grid centre + zoom level, no animation) and renders one frame. */
  setCamera(gx: number, gy: number, zoomIndex: ZoomIndex): void;
  /** Screen px (CSS) of a grid point under the current camera. */
  screenOfGrid(gx: number, gy: number): { sx: number; sy: number };
  /** Collects `n` consecutive rAF frames of renderer stats (the loop must be running). */
  collect(
    n: number,
  ): Promise<
    Array<{
      updateMs: number;
      renderMs: number;
      drawCalls: number;
      visibleUnits: number;
      visibleChunks: number;
    }>
  >;
  eids(): number[];
}
declare global {
  interface Window {
    __renderHarness?: RenderHarness;
  }
}

async function main(): Promise<void> {
  const w = num('w', 1280);
  const h = num('h', 720);
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const seed = num('seed', 1);
  const terrain = buildTerrainMap(MAP, MAP, demoBlockedRle(MAP, MAP), seed);
  const unitCount = num('units', 400);
  const feed = createFakeFeed({
    units: unitCount,
    mapW: MAP,
    mapH: MAP,
    seed,
    spacing: num('spacing', 1.6),
  });
  feed.step(performance.now());
  const bg = q.get('bg');
  const renderer = await createRenderer({
    canvas,
    simClient: feed,
    terrain,
    zoomTauMs: 80, // harness-local (the app passes game.json camera.zoomTauMs)
    unitRadiusFx: [350, 400, 450, 500, 600],
    hardTerrainTiles: q.get('ctl') === '1',
    background: bg ? parseInt(bg, 16) : 0x0b0d10,
  });
  const setCamera = (gx: number, gy: number, zi: ZoomIndex): void => {
    const c = gridToWorld(gx, gy);
    renderer.camera.x = c.x;
    renderer.camera.y = c.y;
    renderer.camera.zoomIndex = zi;
    renderer.camera.zoomT = ZOOMS[zi];
    renderer.camera.anchor = null;
    renderer.frameOnce();
  };
  const eids = (): number[] => {
    const out: number[] = [];
    for (let s = 0; s < feed.view.highWater; s++) out.push(feed.view.eid(s));
    return out;
  };
  const sel = num('select', 0);
  if (sel > 0)
    renderer.setSelected(
      eids()
        .filter((_, i) => (feed.view.owner[i] ?? 255) === 0)
        .slice(0, sel),
    );
  const mx = q.get('markerX');
  if (mx !== null) renderer.spawnMarker(Number(mx), num('markerY', 0));

  const api: RenderHarness = {
    ready: false,
    renderer,
    feed,
    setCamera,
    screenOfGrid: (gx, gy) => {
      const p = gridToWorld(gx, gy);
      const s = worldToScreen(renderer.camera, renderer.viewport, p.x, p.y);
      return { sx: s.x, sy: s.y };
    },
    collect: (n) =>
      new Promise((resolve) => {
        const out: Array<{
          updateMs: number;
          renderMs: number;
          drawCalls: number;
          visibleUnits: number;
          visibleChunks: number;
        }> = [];
        let last = renderer.stats.frames;
        const poll = (): void => {
          const s = renderer.stats;
          if (s.frames !== last) {
            last = s.frames;
            out.push({
              updateMs: s.updateMs,
              renderMs: s.renderMs,
              drawCalls: s.drawCalls,
              visibleUnits: s.visibleUnits,
              visibleChunks: s.visibleChunks,
            });
          }
          if (out.length >= n) resolve(out);
          else requestAnimationFrame(poll);
        };
        poll();
      }),
    eids,
  };
  window.__renderHarness = api;
  setCamera(num('gx', MAP / 2), num('gy', MAP / 2), num('zoom', 1) as ZoomIndex);
  if (q.get('moving') === '1') setInterval(() => feed.step(performance.now()), 50);
  if (q.get('loop') === '1') renderer.start();
  api.ready = true;
  console.log('RENDER HARNESS READY');
}

main().catch((e: unknown) => {
  console.error('RENDER HARNESS FAIL', e);
  (window as { __renderHarnessError?: string }).__renderHarnessError = String(e);
});
