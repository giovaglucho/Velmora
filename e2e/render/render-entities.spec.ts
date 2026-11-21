import { expect, test } from '@playwright/test';
import { openHarness, percentile, readPng, saveMedia, watchConsole } from './render-helpers';

// R3 — unit layer: sprites, interpolation, depth order, culling, rings (ADR-006 §3.7, §4.3, §4.4, §4.7).
// Fixed scene: 128×128 map, 400 fake units (2 owners, 5 types) in a block at the map centre.
const ZOOMS = [0.6, 1, 1.4] as const;
const BLOCK = 'units=400&spacing=0.85&gx=64&gy=64';

test.describe('entities', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  for (const zi of [0, 1, 2] as const) {
    test(`400 units captured at zoom ${ZOOMS[zi]} (culling keeps only the visible ones)`, async ({
      page,
    }) => {
      const errors = watchConsole(page);
      await openHarness(page, `${BLOCK}&zoom=${zi}&select=40`);
      const stats = await page.evaluate(() => ({ ...window.__renderHarness!.renderer.stats }));
      const shot = await page.screenshot();
      saveMedia(`render-400units-z${ZOOMS[zi]}.png`, shot);
      console.log(`400 units z${ZOOMS[zi]}`, JSON.stringify(stats));
      if (zi === 0)
        expect(stats.visibleUnits).toBe(400); // whole block fits at 0.6
      else expect(stats.visibleUnits).toBeLessThan(400);
      expect(stats.visibleUnits).toBeGreaterThan(50);
      expect(stats.visibleRings).toBeGreaterThan(0);
      // non-trivial image: plenty of team-coloured pixels (blue 0x3b82f6 / red 0xef4444)
      const png = readPng(shot);
      let blue = 0;
      let red = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        const r = png.data[i]!;
        const g = png.data[i + 1]!;
        const b = png.data[i + 2]!;
        if (Math.abs(r - 0x3b) < 10 && Math.abs(g - 0x82) < 10 && Math.abs(b - 0xf6) < 10) blue++;
        if (Math.abs(r - 0xef) < 10 && Math.abs(g - 0x44) < 10 && Math.abs(b - 0x44) < 10) red++;
      }
      expect(blue).toBeGreaterThan(200);
      expect(red).toBeGreaterThan(200);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }

  test('culling: visible units follow the viewport (far camera → 0; zoom in → fewer)', async ({
    page,
  }) => {
    await openHarness(page, `${BLOCK}&zoom=1`);
    const counts = await page.evaluate(() => {
      const h = window.__renderHarness!;
      const out: Record<string, number> = {};
      h.setCamera(64, 64, 0);
      out.z06 = h.renderer.stats.visibleUnits;
      h.setCamera(64, 64, 1);
      out.z1 = h.renderer.stats.visibleUnits;
      h.setCamera(64, 64, 2);
      out.z14 = h.renderer.stats.visibleUnits;
      h.setCamera(8, 8, 1);
      out.far = h.renderer.stats.visibleUnits;
      h.setCamera(64, 64, 1);
      out.back = h.renderer.stats.visibleUnits;
      return out;
    });
    console.log('culling', JSON.stringify(counts));
    expect(counts.z06).toBe(400);
    expect(counts.z1).toBeLessThan(counts.z06!);
    expect(counts.z14).toBeLessThan(counts.z1!);
    expect(counts.far).toBe(0);
    expect(counts.back).toBe(counts.z1);
  });

  test('depth order: the unit further south is in front, regardless of slot / creation order', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await openHarness(page, 'units=2&spacing=1&gx=64&gy=64&zoom=1');
    const run = async (frontSlot: 0 | 1) => {
      const at = await page.evaluate((front) => {
        const h = window.__renderHarness!;
        const v = h.feed.view;
        v.highWater = 2;
        for (let s = 0; s < 2; s++) {
          v.prevX[s] = v.posX[s] = s === front ? 64_100 : 64_000;
          v.prevY[s] = v.posY[s] = s === front ? 64_100 : 64_000;
          v.flags[s] = 1; // alive, not moving → idle frame
          v.facing[s] = 0;
          v.typeId[s] = 0;
        }
        v.owner[0] = 0; // blue
        v.owner[1] = 1; // red
        h.feed.latestArrivalMs = performance.now() - 10_000; // alpha = 1
        h.setCamera(64, 64, 1);
        const p = h.screenOfGrid(64.1, 64.1);
        return p;
      }, frontSlot);
      // torso team band of the idle frame spans frame y 48..64 → centre 56; foot (anchor) at y 84.48
      const png = readPng(await page.screenshot());
      const x = Math.round(at.sx);
      const y = Math.round(at.sy - (84.48 - 56));
      const i = (y * png.width + x) * 4;
      return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
    };
    const blue = [0x3b, 0x82, 0xf6];
    const red = [0xef, 0x44, 0x44];
    const near = (a: number[], b: number[]) => a.every((v, k) => Math.abs(v - b[k]!) < 14);
    const front0 = await run(0);
    saveMedia('render-depth-slot0-front.png', await page.screenshot());
    const front1 = await run(1);
    saveMedia('render-depth-slot1-front.png', await page.screenshot());
    console.log('depth', JSON.stringify({ front0, front1 }));
    expect(near(front0, blue), `slot 0 (blue) in front: got ${front0}`).toBe(true);
    expect(near(front1, red), `slot 1 (red) in front: got ${front1}`).toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('interpolation: sprite sits at prev + (pos − prev)·alpha; saturates at 1; no interpolation across a teleport', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await openHarness(page, 'units=1&gx=60&gy=60&zoom=1');
    const r = await page.evaluate(() => {
      const h = window.__renderHarness!;
      const v = h.feed.view;
      const first = h.renderer.layers.entities.children[0] as unknown as { x: number; y: number };
      const world = (gx: number, gy: number) => ({ x: (gx - gy) * 64, y: (gx + gy) * 32 });
      const out: Record<string, { got: number[]; want: number[] }> = {};
      const frame = (
        label: string,
        prev: [number, number],
        pos: [number, number],
        alphaMs: number,
        want: [number, number],
      ) => {
        v.prevX[0] = prev[0];
        v.prevY[0] = prev[1];
        v.posX[0] = pos[0];
        v.posY[0] = pos[1];
        v.tickIntervalUs = 2_000_000; // 2 s tick so a few ms of drift moves alpha by < 0.003
        h.feed.latestArrivalMs = performance.now() - alphaMs;
        h.renderer.frameOnce();
        const w = world(want[0] / 1000, want[1] / 1000);
        out[label] = { got: [first.x, first.y], want: [w.x, w.y] };
      };
      h.setCamera(60, 60, 1);
      frame('alpha0.25', [60_000, 60_000], [60_080, 59_920], 500, [60_020, 59_980]);
      frame('alpha0.5', [60_000, 60_000], [60_080, 59_920], 1000, [60_040, 59_960]);
      frame('saturated', [60_000, 60_000], [60_080, 59_920], 9000, [60_080, 59_920]);
      frame('teleport', [60_000, 60_000], [66_000, 60_000], 1000, [66_000, 60_000]);
      return out;
    });
    console.log('interp', JSON.stringify(r));
    for (const [k, v] of Object.entries(r)) {
      expect(v.got[0], k + ' x').toBeCloseTo(v.want[0], 0);
      expect(v.got[1], k + ' y').toBeCloseTo(v.want[1], 0);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  for (const zi of [0, 1] as const) {
    test(`updateMs / draw calls with 400 moving units at zoom ${ZOOMS[zi]}`, async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchConsole(page);
      await openHarness(page, `${BLOCK}&zoom=${zi}&moving=1&loop=1&select=40`);
      await page.evaluate(() => window.__renderHarness!.collect(60)); // warm-up
      const frames = await page.evaluate(() => window.__renderHarness!.collect(300));
      const upd = frames.map((f) => f.updateMs);
      const ren = frames.map((f) => f.renderMs);
      const dc = frames.map((f) => f.drawCalls);
      const result = {
        zoom: ZOOMS[zi],
        frames: frames.length,
        updateMs: { p50: percentile(upd, 50), p95: percentile(upd, 95), max: Math.max(...upd) },
        renderMsJs: { p50: percentile(ren, 50), p95: percentile(ren, 95), max: Math.max(...ren) },
        drawCalls: { p50: percentile(dc, 50), p95: percentile(dc, 95), max: Math.max(...dc) },
        visibleUnits: frames[frames.length - 1]!.visibleUnits,
        visibleChunks: frames[frames.length - 1]!.visibleChunks,
      };
      console.log('PERF', JSON.stringify(result));
      saveMedia(`render-400units-moving-z${ZOOMS[zi]}.png`, await page.screenshot());
      expect(result.updateMs.p95).toBeLessThanOrEqual(4); // ADR-006 §10.2 proxy gate
      expect(result.drawCalls.max).toBeLessThanOrEqual(60);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }

  test('steady state: the unit layer adds no per-frame heap growth over a terrain-only baseline', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const cdp = await page.context().newCDPSession(page);
    const measure = async (query: string) => {
      await openHarness(page, query);
      await page.evaluate(() => window.__renderHarness!.collect(120)); // warm-up: pools, shader compile
      await cdp.send('HeapProfiler.collectGarbage');
      const before = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      const frames = await page.evaluate(() => window.__renderHarness!.collect(200));
      const after = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      return (after - before) / frames.length;
    };
    const baseline = await measure('units=0&zoom=1&gx=64&gy=64&loop=1');
    const withUnits = await measure(`${BLOCK}&zoom=1&loop=1&select=40`);
    console.log(
      'HEAP',
      JSON.stringify({
        terrainOnlyBytesPerFrame: Math.round(baseline),
        units400BytesPerFrame: Math.round(withUnits),
      }),
    );
    // Pixi's own submission and the harness' sample array allocate a little; 400 units + 40 rings must add ≤ 2 KB/frame (≈ 0.8 KB measured: Pixi sort/transform bookkeeping, not our loop).
    expect(withUnits - baseline).toBeLessThan(2048);
  });
});
