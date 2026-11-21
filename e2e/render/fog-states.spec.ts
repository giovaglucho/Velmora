import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { bundleFogHarness } from './fog-harness/bundle';

// R6/R7 (K3): the three fog states on the rendered pixels, enemy hiding, texture-upload economy, and the
// minimap (fog, units, click -> navigate). Runs a bare Pixi stage against a FAKE snapshot source.

interface Harness {
  ready: boolean;
  error?: string;
  fogState(tx: number, ty: number): number;
  targetState(tx: number, ty: number): number;
  shownValue(tx: number, ty: number): number;
  screenOfTile(tx: number, ty: number): { x: number; y: number };
  visible(): boolean[];
  uploads(): number;
  fading(): boolean;
  minimapDraws(): number;
  navigations: { gx: number; gy: number }[];
  orders: { gx: number; gy: number }[];
  moveScout(tx: number, ty: number): void;
  frame(dtMs: number): void;
  settle(): void;
}
const ART = path.join(process.cwd(), 'test-results/render/fog');
const MEDIA = path.join(process.cwd(), 'docs/progress/fase-02/media');

let bundle: { js: string; html: string };
test.beforeAll(() => {
  bundle = bundleFogHarness();
  fs.mkdirSync(ART, { recursive: true });
  fs.mkdirSync(MEDIA, { recursive: true });
});

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message') && m.text().includes('Performance')) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/fog-harness.html', (r) =>
    r.fulfill({ body: bundle.html, contentType: 'text/html' }),
  );
  await page.route('**/fog-harness.js', (r) =>
    r.fulfill({ body: bundle.js, contentType: 'text/javascript' }),
  );
  await page.goto('/fog-harness.html');
  await page.waitForFunction(
    () => (window as unknown as { __fogHarness?: { ready: boolean } }).__fogHarness !== undefined,
  );
  const err = await page.evaluate(
    () => (window as unknown as { __fogHarness: { error?: string } }).__fogHarness.error,
  );
  expect(err).toBeUndefined();
  return errors;
}
/** Calls a method of the page-side harness by name. */
const evp = <T>(page: Page, name: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(
    ([n, a]) => {
      const x = (
        window as unknown as { __fogHarness: Record<string, (...y: unknown[]) => unknown> }
      ).__fogHarness;
      return (x[n as string] as (...y: unknown[]) => unknown)(...(a as unknown[]));
    },
    [name, args] as const,
  ) as Promise<T>;

type Rgb = readonly [number, number, number];
function pixelAt(png: PNG, x: number, y: number): Rgb {
  const i = (y * png.width + x) * 4;
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0];
}

test('three fog states render as unexplored (black), explored (dimmed), visible (terrain)', async ({
  page,
}) => {
  const errors = await open(page);
  const get = <T>(f: string, ...a: unknown[]) => evp<T>(page, f, ...a);
  await get('settle');
  // Tiles chosen deep inside each region (the 9-tap blur needs a uniform neighbourhood to be exact).
  const unexplored = { tx: 28, ty: 4 }; // never seen
  const explored = { tx: 10, ty: 16 }; // scout passed here (path (6..22,16)), now far from it
  const visible = { tx: 22, ty: 14 }; // 2 tiles from the scout at (22,16), inside its r=4 disc
  expect(await get('fogState', unexplored.tx, unexplored.ty)).toBe(0);
  expect(await get('fogState', explored.tx, explored.ty)).toBe(1);
  expect(await get('fogState', visible.tx, visible.ty)).toBe(2);

  const shot = await page.locator('#c').screenshot();
  fs.writeFileSync(path.join(ART, 'fog-states.png'), shot);
  fs.writeFileSync(path.join(MEDIA, 'fog-states.png'), shot);
  const png = PNG.sync.read(shot);
  const px = async (t: { tx: number; ty: number }) => {
    const s = await get<{ x: number; y: number }>('screenOfTile', t.tx, t.ty);
    return pixelAt(png, s.x, s.y);
  };
  const u = await px(unexplored);
  const e = await px(explored);
  const v = await px(visible);
  console.log('pixels unexplored/explored/visible', JSON.stringify({ u, e, v }));
  // Terrain stand-in is (64,192,64). Overlay colour (5,8,13): a=1.0 -> ~black; a=0.55 -> 0.45·terrain + 0.55·fog; a=0 -> terrain.
  expect(Math.max(...u)).toBeLessThanOrEqual(16);
  expect(v).toEqual([0x40, 0xc0, 0x40]);
  expect(e[1]).toBeGreaterThan(70);
  expect(e[1]).toBeLessThan(110);
  expect(e[0]).toBeLessThan(45);
  expect(e[0]).toBeGreaterThan(20);
  // Explored sits strictly between the other two (luma).
  const luma = (c: Rgb) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  expect(luma(u)).toBeLessThan(luma(e));
  expect(luma(e)).toBeLessThan(luma(v));

  // Shown texel values match the target state of each tile.
  expect(await get('shownValue', unexplored.tx, unexplored.ty)).toBe(0);
  expect(await get('shownValue', explored.tx, explored.ty)).toBe(128);
  expect(await get('shownValue', visible.tx, visible.ty)).toBe(255);

  // Soft edge: walking along y=16 across the visible/explored border passes through intermediate colours.
  const row: number[] = [];
  for (let tx = 22; tx <= 30; tx++) {
    const s = await get<{ x: number; y: number }>('screenOfTile', tx, 16);
    row.push(pixelAt(png, s.x, s.y)[1]);
  }
  console.log('green channel across the sight border (tx 22..30):', row.join(','));
  const distinct = new Set(row).size;
  expect(distinct).toBeGreaterThanOrEqual(4); // blurred edge, not a hard step
  expect(errors, errors.join('\n')).toEqual([]);
});

test('enemies and neutrals outside vision are hidden; own units always drawn', async ({ page }) => {
  const errors = await open(page);
  const vis = await page.evaluate(() =>
    (window as unknown as { __fogHarness: Harness }).__fogHarness.visible(),
  );
  // slots: 0 scout (own), 1 enemy in sight, 2 enemy far, 3 neutral far, 4 own without vision
  expect(vis.slice(0, 5)).toEqual([true, true, false, false, true]);
  const shot = await page.locator('#c').screenshot();
  const png = PNG.sync.read(shot);
  const at = async (tx: number, ty: number) => {
    const s = await page.evaluate(
      ([x, y]) =>
        (window as unknown as { __fogHarness: Harness }).__fogHarness.screenOfTile(
          x as number,
          y as number,
        ),
      [tx, ty] as const,
    );
    return pixelAt(png, s.x, s.y);
  };
  const enemyInSight = await at(22, 18);
  expect(enemyInSight[0]).toBeGreaterThan(200); // red dot (0xef4444) drawn over the visible terrain
  const enemyHidden = await at(4, 4);
  expect(Math.max(...enemyHidden)).toBeLessThanOrEqual(16); // fogged black, no dot
  expect(errors, errors.join('\n')).toEqual([]);
});

test('fade is progressive and uploads happen only on frames that change texels', async ({
  page,
}) => {
  const errors = await open(page);
  const ev = <T>(f: string, ...a: unknown[]) => evp<T>(page, f, ...a);

  await ev('settle');
  expect(await ev('fading')).toBe(false);
  // Steady state: 30 frames with nothing changing -> zero uploads.
  const u0 = await ev<number>('uploads');
  for (let i = 0; i < 30; i++) await ev('frame', 16);
  expect(await ev<number>('uploads')).toBe(u0);

  // Move the scout one tile: the newly seen tiles start fading in. Uploads are batched (≤ 15 Hz), so run frames
  // until the first upload and check that the shown value is intermediate, not a jump.
  await ev('moveScout', 23, 16);
  await ev('frame', 16); // the frame picks up the new states: targets change, nothing shown yet
  const edgeTx = 27; // (23,16) r=4 reaches x=27, which was never seen before: texel 0 -> 255
  expect(await ev('targetState', edgeTx, 16)).toBe(2);
  expect(await ev('shownValue', edgeTx, 16)).toBe(0);
  let guard = 0;
  while ((await ev<number>('uploads')) === u0 && guard++ < 20) await ev('frame', 16);
  const shown1 = await ev<number>('shownValue', edgeTx, 16);
  expect(shown1).toBeGreaterThan(0);
  expect(shown1).toBeLessThan(255);
  expect(await ev('fading')).toBe(true);
  // Completes within ~170 ms + slack; uploads stop afterwards.
  for (let i = 0; i < 20; i++) await ev('frame', 16);
  expect(await ev('shownValue', edgeTx, 16)).toBe(255);
  expect(await ev('fading')).toBe(false);
  const u1 = await ev<number>('uploads');
  for (let i = 0; i < 30; i++) await ev('frame', 16);
  expect(await ev<number>('uploads')).toBe(u1);
  // A single tile step costs a handful of uploads (the fade), not one per frame forever.
  expect(u1 - u0).toBeLessThanOrEqual(8);
  console.log('uploads for one tile step:', u1 - u0);

  // Worst case for the R6 criterion: a unit changing tile EVERY frame for one second (60 frames of 16.67 ms).
  const w0 = await ev<number>('uploads');
  for (let i = 0; i < 60; i++) {
    await ev('moveScout', 4 + ((i * 7) % 24), 16);
    await ev('frame', 1000 / 60);
  }
  const w1 = await ev<number>('uploads');
  console.log('uploads in 1 s of continuous movement:', w1 - w0);
  expect(w1 - w0).toBeLessThan(20);
  expect(w1 - w0).toBeGreaterThanOrEqual(10); // it does keep animating
  expect(errors, errors.join('\n')).toEqual([]);
});

test('minimap: fog, own units, camera quad; 10 Hz throttle; click navigates to the corner (±1 tile)', async ({
  page,
}) => {
  const errors = await open(page);
  const ev = <T>(f: string, ...a: unknown[]) => evp<T>(page, f, ...a);
  await ev('settle');
  const mm = page.locator('#mm');
  const shot = await mm.screenshot();
  fs.writeFileSync(path.join(ART, 'minimap.png'), shot);
  fs.writeFileSync(path.join(MEDIA, 'minimap-fog.png'), shot);
  const png = PNG.sync.read(shot);
  expect(png.width).toBe(256);
  expect(png.height).toBe(128);
  // Map (tx, ty) -> minimap px: mx = (gx - gy + 32)/64·256, my = (gx + gy)/64·128.
  const mp = (gx: number, gy: number) => ({
    x: Math.round(((gx - gy + 32) / 64) * 256),
    y: Math.round(((gx + gy) / 64) * 128),
  });
  const vis = mp(22.5, 16.5);
  const expl = mp(10.5, 16.5);
  const unexp = mp(28.5, 4.5);
  const pv = pixelAt(png, vis.x, vis.y);
  const pe = pixelAt(png, expl.x, expl.y);
  const pu = pixelAt(png, unexp.x, unexp.y);
  console.log('minimap pixels visible/explored/unexplored', JSON.stringify({ pv, pe, pu }));
  // scout dot is player-0 blue 2x2 near (22.5,16.5); sample a pixel that is not covered by the dot
  const pvClean = pixelAt(png, vis.x + 6, vis.y);
  expect(pvClean[1]).toBeGreaterThan(150); // terrain green, undimmed
  expect(pe[1]).toBeLessThan(pvClean[1] * 0.7);
  expect(Math.max(...pu)).toBeLessThanOrEqual(16);
  // own scout dot (0x3b82f6) present on top of the visible region
  const dot = pixelAt(png, mp(22.5, 16.5).x, mp(22.5, 16.5).y);
  expect(dot[2]).toBeGreaterThan(200);
  // the enemy in sight (red) is drawn, the one in the fog (4,4) is not
  const enemy = mp(22.5, 18.5);
  expect(pixelAt(png, enemy.x, enemy.y)[0]).toBeGreaterThan(200);
  const hiddenEnemy = mp(4.5, 4.5);
  expect(Math.max(...pixelAt(png, hiddenEnemy.x, hiddenEnemy.y))).toBeLessThanOrEqual(16);
  // camera quad: white outline around grid (10..18)^2 -> its top vertex at mp(10,10)
  const camTop = mp(10, 10);
  const white = pixelAt(png, camTop.x, camTop.y + 0);
  expect(Math.min(...white)).toBeGreaterThan(150);

  // 10 Hz throttle: 100 frames of 5 ms = 500 ms of simulated time -> ~5 draws, not 100.
  const d0 = await ev<number>('minimapDraws');
  for (let i = 0; i < 100; i++) await ev('frame', 5);
  const d1 = await ev<number>('minimapDraws');
  console.log('minimap draws in 500 ms simulated:', d1 - d0);
  expect(d1 - d0).toBeGreaterThanOrEqual(4);
  expect(d1 - d0).toBeLessThanOrEqual(6);

  // Clicks. Box = 256x128 CSS px; click just inside each diamond vertex.
  const box = (await mm.boundingBox())!;
  const clickAt = async (x: number, y: number, button: 'left' | 'right' = 'left') =>
    page.mouse.click(box.x + x, box.y + y, { button });
  const last = async () => {
    const n = await page.evaluate(
      () => (window as unknown as { __fogHarness: Harness }).__fogHarness.navigations,
    );
    return n[n.length - 1]!;
  };
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  await clickAt(128, 0.5); // top vertex -> (0,0)
  let n = await last();
  expect(near(n.gx, 0) && near(n.gy, 0), JSON.stringify(n)).toBe(true);
  await clickAt(255.5, 64); // right vertex -> (32,0)
  n = await last();
  expect(near(n.gx, 32) && near(n.gy, 0), JSON.stringify(n)).toBe(true);
  await clickAt(128, 127.5); // bottom -> (32,32)
  n = await last();
  expect(near(n.gx, 32) && near(n.gy, 32), JSON.stringify(n)).toBe(true);
  await clickAt(0.5, 64); // left -> (0,32)
  n = await last();
  expect(near(n.gx, 0) && near(n.gy, 32), JSON.stringify(n)).toBe(true);
  await clickAt(128, 64); // centre -> (16,16)
  n = await last();
  expect(near(n.gx, 16) && near(n.gy, 16), JSON.stringify(n)).toBe(true);

  // Drag keeps navigating; right click is an order and not a navigation.
  const navBefore = await page.evaluate(
    () => (window as unknown as { __fogHarness: Harness }).__fogHarness.navigations.length,
  );
  await page.mouse.move(box.x + 100, box.y + 64);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 64, { steps: 4 });
  await page.mouse.up();
  const navAfter = await page.evaluate(
    () => (window as unknown as { __fogHarness: Harness }).__fogHarness.navigations.length,
  );
  expect(navAfter - navBefore).toBeGreaterThanOrEqual(4);
  await clickAt(128, 64, 'right');
  const orders = await page.evaluate(
    () => (window as unknown as { __fogHarness: Harness }).__fogHarness.orders,
  );
  expect(orders.length).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});
