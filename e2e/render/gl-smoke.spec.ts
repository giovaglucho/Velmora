import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// T0 smoke (ADR-006 risk #1): PixiJS v8 + WebGL2 under SwiftShader draws a quad with a custom shader.
test('Pixi v8 renders a custom-shader quad on WebGL2 (SwiftShader)', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    // SwiftShader emits "GL Driver Message ... Performance ... GPU stall due to ReadPixels" on readback
    // (our own screenshot); it is a perf hint, not a failure. Everything else must be clean.
    if (m.text().includes('GL Driver Message') && m.text().includes('Performance')) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto('/gl-smoke.html');
  await page.waitForFunction(() => (window as { __glSmoke?: unknown }).__glSmoke !== undefined);
  const result = await page.evaluate(
    () => (window as unknown as { __glSmoke: Record<string, unknown> }).__glSmoke,
  );
  console.log('glSmoke', JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  expect(result.webGLVersion).toBe(2);
  expect(String(result.rendererName)).toMatch(/swiftshader/i);

  const png = PNG.sync.read(await page.locator('#c').screenshot());
  const at = (x: number, y: number) => {
    const i = (y * png.width + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]] as const;
  };
  // Quad spans px 40..280 × 40..200, checker of 4×4 cells (60 × 40 px each).
  expect(at(10, 10)).toEqual([0, 0, 0]); // background outside the quad
  const a = at(70, 60); // cell (0,0): c = 0 -> red
  const b = at(130, 60); // cell (1,0): c = 1 -> green
  expect(a).toEqual([255, 0, 0]);
  expect(b).toEqual([0, 255, 0]);
  let coloured = 0;
  for (let i = 0; i < png.data.length; i += 4)
    if ((png.data[i] ?? 0) > 200 || (png.data[i + 1] ?? 0) > 200) coloured++;
  expect(coloured).toBeGreaterThan(png.width * png.height * 0.4);

  expect(errors, errors.join('\n')).toEqual([]);
});
