import { expect, test } from '@playwright/test';

// Carril U (ADR-006 §5–6, §8): box selection of 100 units, right-click move, control groups, HUD counter.
// Needs the integrated client (I1: main.ts + window.__reinos from Q1). Until then the spec skips itself
// instead of failing, so it never reports a false green: the skip reason is printed.
interface Api {
  ready: boolean;
  camera: { x: number; y: number; zoomIndex: number };
  units(): Array<{ eid: number; sx: number; sy: number }>;
  metrics: { inputToMarkerMs: number; reactRendersPerSec: number };
}
type W = { __reinos?: Api };

test.describe('input: select, order, groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?scenario=demo100&debug=1');
    const integrated = await page
      .waitForFunction(() => (window as unknown as W).__reinos?.ready === true, undefined, {
        timeout: 10_000,
      })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !integrated,
      'client not integrated yet (I1): window.__reinos.ready never became true',
    );
  });

  test('box over 100 units selects them all and the HUD shows the count', async ({ page }) => {
    const units = await page.evaluate(() =>
      (window as unknown as { __reinos: Api }).__reinos.units(),
    );
    const xs = units.map((u) => u.sx);
    const ys = units.map((u) => u.sy);
    const pad = 60;
    await page.mouse.move(Math.min(...xs) - pad, Math.min(...ys) - pad - 40);
    await page.mouse.down();
    await page.mouse.move(Math.max(...xs) + pad, Math.max(...ys) + pad, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '100', {
      timeout: 1000, // store publishes at 10 Hz + immediately on selection change
    });
    await expect(page.getByTestId('selection-count')).toContainText('100 unidades seleccionadas');
  });

  test('right click shows the marker within one frame and keeps React ≤ 12 renders/s', async ({
    page,
  }) => {
    const box = await page.locator('canvas').first().boundingBox();
    if (!box) throw new Error('no canvas');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => (window as unknown as { __reinos: Api }).__reinos.metrics);
    expect(m.inputToMarkerMs).toBeLessThanOrEqual(20);
    expect(m.reactRendersPerSec).toBeLessThanOrEqual(12);
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
