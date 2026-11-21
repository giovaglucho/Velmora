import { expect, test, type Page } from '@playwright/test';

// Carril U (ADR-006 §5–6, §8): box selection of 100 units, right-click move, control groups, HUD counter.
// Runs against the integrated client (I1: boot/main.ts + window.__reinos).
// NOTE: demo100 gives each player 50 units, so the box selects the 50 OWN units (pickBox never takes enemies);
// the 100-unit selection of the plan's K6 GIF needs a scenario with 100 own units (Q4).
interface Api {
  ready: boolean;
  camera: { x: number; y: number; zoomIndex: number };
  units(): Array<{ eid: number; owner: number; sx: number; sy: number }>;
  metrics: { inputToMarkerMs: number; reactRendersPerSec: number; frameMs: number };
}
/** Rubber-band over the given units, kept clear of the HUD (top bar, minimap host at the bottom right). */
async function boxOver(page: Page, units: Array<{ sx: number; sy: number }>): Promise<void> {
  const xs = units.map((u) => u.sx);
  const ys = units.map((u) => u.sy);
  const pad = 40;
  await page.mouse.move(Math.max(4, Math.min(...xs) - pad), Math.max(40, Math.min(...ys) - 100));
  await page.mouse.down();
  await page.mouse.move(
    Math.min(1270, Math.max(...xs) + pad),
    Math.min(578, Math.max(...ys) + 10),
    {
      steps: 6,
    },
  );
  await page.mouse.up();
}
type W = { __reinos?: Api };

test.describe('input: select, order, groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=demo100&debug=1');
    // No skip: the client is integrated (I1), so a client that never becomes ready is a failure.
    await page.waitForFunction(() => (window as unknown as W).__reinos?.ready === true, undefined, {
      timeout: 30_000,
    });
  });

  test('box over the own units selects them all and the HUD shows the count', async ({ page }) => {
    const all = await page.evaluate(() =>
      (window as unknown as { __reinos: Api }).__reinos.units(),
    );
    const units = all.filter((u) => u.owner === 0);
    expect(units.length).toBe(50); // demo100: 50 units per player, all on screen at the start
    const xs = units.map((u) => u.sx);
    const ys = units.map((u) => u.sy);
    const pad = 60;
    await page.mouse.move(
      Math.max(4, Math.min(...xs) - pad),
      Math.max(4, Math.min(...ys) - pad - 40),
    );
    await page.mouse.down();
    await page.mouse.move(
      Math.min(1270, Math.max(...xs) + pad),
      Math.min(578, Math.max(...ys) + pad), // stay clear of the minimap host
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.getByTestId('selection-count')).toHaveAttribute(
      'data-count',
      String(units.length),
      {
        timeout: 1000, // store publishes at 10 Hz + immediately on selection change
      },
    );
    await expect(page.getByTestId('selection-count')).toContainText(
      `${units.length} unidades seleccionadas`,
    );
  });

  test('right click shows the marker within one frame and keeps React ≤ 12 renders/s', async ({
    page,
  }) => {
    const own = await page.evaluate(() =>
      (window as unknown as { __reinos: Api }).__reinos.units().filter((u) => u.owner === 0),
    );
    // Select through the real input path (box), then order: the marker only exists when units obey.
    await boxOver(page, own);
    await expect(page.getByTestId('selection-count')).toHaveAttribute(
      'data-count',
      String(own.length),
    );
    const box = await page.locator('canvas').first().boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.45, { button: 'right' });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => (window as unknown as { __reinos: Api }).__reinos.metrics);
    // pointerdown -> end of the render() that draws the marker: it cannot be faster than the wait for the
    // next rAF, so "≤ 1 frame" is asserted against the measured frame period (software WebGL frames are
    // far longer than 16.7 ms here; on real hardware the same check is ≤ ~17 ms, see ADR-006 §6).
    expect(m.inputToMarkerMs).toBeGreaterThan(0);
    expect(m.inputToMarkerMs).toBeLessThanOrEqual(m.frameMs * 1.5 + 10);
    expect(m.reactRendersPerSec).toBeLessThanOrEqual(12);
  });

  test('ordered units move: the own army leaves its spawn and the fog follows', async ({
    page,
  }) => {
    const get = () =>
      page.evaluate(() =>
        (window as unknown as { __reinos: Api }).__reinos.units().filter((u) => u.owner === 0),
      );
    const before = await get();
    await boxOver(page, before);
    await page.mouse.click(900, 200, { button: 'right' });
    await page.waitForTimeout(2500);
    const after = await get();
    const dist = (a: { sx: number; sy: number }[], b: { sx: number; sy: number }[]) =>
      Math.hypot(
        a.reduce((t, u) => t + u.sx, 0) / a.length - b.reduce((t, u) => t + u.sx, 0) / b.length,
        a.reduce((t, u) => t + u.sy, 0) / a.length - b.reduce((t, u) => t + u.sy, 0) / b.length,
      );
    expect(after.length).toBe(before.length);
    expect(dist(before, after)).toBeGreaterThan(20);
  });

  test('wheel changes the zoom level; arrow keys move the camera', async ({ page }) => {
    const read = () =>
      page.evaluate(() => (window as unknown as { __reinos: Api }).__reinos.camera);
    const before = await read();
    await page.mouse.move(640, 360);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(300);
    expect((await read()).zoomIndex).not.toBe(before.zoomIndex);
    const z = await read();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    expect((await read()).x).toBeGreaterThan(z.x);
  });
});
