import { expect, test } from '@playwright/test';
import { openHarness, readPng, saveMedia, watchConsole } from './render-helpers';
import { seamMetric } from './render-seams';

// R2 — terrain by 16×16 chunks with grid-space splatting (ADR-006 §4.6). Fixed scene: 128×128 map, no units.
const ZOOMS = [0.6, 1, 1.4] as const;
const CENTER = { gx: 64, gy: 64 };
const RATIO_MAX = 1.15;

test.describe('terrain splatting', () => {
  for (const zi of [0, 1, 2] as const) {
    test(`no visible tile/chunk seams at zoom ${ZOOMS[zi]} (ratio ≤ ${RATIO_MAX})`, async ({
      page,
    }) => {
      const errors = watchConsole(page);
      await page.setViewportSize({ width: 1280, height: 720 });
      await openHarness(page, `units=0&zoom=${zi}&gx=${CENTER.gx}&gy=${CENTER.gy}`);
      const shot = await page.screenshot();
      saveMedia(`render-terrain-z${ZOOMS[zi]}.png`, shot);
      const m = seamMetric(
        readPng(shot),
        { ...CENTER, zoom: ZOOMS[zi], vw: 1280, vh: 720 },
        128,
        128,
      );
      console.log(`seams z${ZOOMS[zi]}`, JSON.stringify(m));
      expect(m.samples).toBeGreaterThan(10_000);
      expect(m.chunkLines).toBeGreaterThanOrEqual(2);
      expect(m.ratioTile).toBeLessThanOrEqual(RATIO_MAX);
      expect(m.ratioChunk).toBeLessThanOrEqual(RATIO_MAX);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }

  test('negative control: independent hard-edged tiles are detected (ratio > 1.15)', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openHarness(page, `units=0&zoom=1&gx=${CENTER.gx}&gy=${CENTER.gy}&ctl=1`);
    const shot = await page.screenshot();
    saveMedia('render-terrain-control-hardtiles.png', shot);
    const m = seamMetric(readPng(shot), { ...CENTER, zoom: 1, vw: 1280, vh: 720 }, 128, 128);
    console.log('seams control', JSON.stringify(m));
    expect(m.ratioTile).toBeGreaterThan(RATIO_MAX);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('no cracks between chunks: no clear-colour pixel inside the map', async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    // magenta clear colour; camera inside the map so the whole viewport is terrain at zoom 0.6? (map is 128 tiles)
    for (const zi of [0, 1, 2]) {
      await openHarness(page, `units=0&zoom=${zi}&gx=64&gy=64&bg=ff00ff`);
      const png = readPng(await page.screenshot());
      let magenta = 0;
      for (let i = 0; i < png.data.length; i += 4)
        if (png.data[i] === 255 && png.data[i + 1] === 0 && png.data[i + 2] === 255) magenta++;
      expect(magenta, `zoom index ${zi}`).toBe(0);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('chunks are culled: fewer visible chunks than the 64 of the map, one draw call each', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openHarness(page, 'units=0&zoom=1&gx=64&gy=64&loop=1');
    const frames = await page.evaluate(() => window.__renderHarness!.collect(10));
    const last = frames[frames.length - 1]!;
    console.log('terrain stats', JSON.stringify(last));
    expect(last.visibleChunks).toBeGreaterThan(0);
    expect(last.visibleChunks).toBeLessThan(64);
    // terrain only: drawCalls = visible chunks (no units, no rings)
    expect(last.drawCalls).toBeLessThanOrEqual(last.visibleChunks + 3);
    expect(last.drawCalls).toBeGreaterThanOrEqual(last.visibleChunks);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
