import { expect, test } from '@playwright/test';
import { openHarness, readPng, saveMedia, watchConsole } from './render-helpers';

// B1 (Fase 2 review) — blocked tiles must be readable on screen: lakes are blue water, forests dark green-ash,
// and both differ from walkable grass and from natural (walkable) rock. Verified by pixels, in both the
// in-memory procedural art and the generated provisional set (water.png through the real loader).
// Harness obstacles: lake rect (20,24,14,10), forest rect (90,30,12,16) (see render/harness/main.ts).
const VIEW = { width: 1280, height: 720 };

type Rgb = [number, number, number];
const lum = ([r, g, b]: Rgb): number => 0.299 * r + 0.587 * g + 0.114 * b;
const dist = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

for (const art of ['procedural', 'provisional'] as const) {
  test(`obstacles are legible on screen (${art} art): lake blue, forest dark, both ≠ grass and ≠ rock`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(VIEW);
    // Locate one tile of each class via the harness's own terrain map, then centre the camera on it.
    await openHarness(page, `units=0&zoom=2&seed=1&art=${art}`);
    const find = async (kind: number, near: [number, number]): Promise<[number, number]> =>
      page.evaluate(
        ([k, nx, ny]) => {
          const h = window.__renderHarness!;
          let best: [number, number] | null = null;
          let bd = Infinity;
          for (let y = 3; y < 125; y++)
            for (let x = 3; x < 125; x++) {
              // whole 5x5 neighbourhood must be of the same kind (pure colour, no blend)
              let ok = true;
              for (let dy = -2; dy <= 2 && ok; dy++)
                for (let dx = -2; dx <= 2; dx++)
                  if (h.kindAt(x + dx, y + dy) !== k) {
                    ok = false;
                    break;
                  }
              if (!ok) continue;
              const d = (x - nx!) ** 2 + (y - ny!) ** 2;
              if (d < bd) {
                bd = d;
                best = [x, y];
              }
            }
          return best;
        },
        [kind, near[0], near[1]] as const,
      ) as unknown as Promise<[number, number]>;
    const shoot = async (kind: number, near: [number, number], name: string): Promise<Rgb> => {
      const t = await find(kind, near);
      expect(t, `no pure tile of kind ${kind}`).not.toBeNull();
      await openHarness(page, `units=0&zoom=2&gx=${t[0] + 0.5}&gy=${t[1] + 0.5}&seed=1&art=${art}`);
      const buf = await page.screenshot();
      saveMedia(`render-obstacle-${art}-${name}.png`, buf);
      const png = readPng(buf);
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = cy - 12; y < cy + 12; y++)
        for (let x = cx - 12; x < cx + 12; x++) {
          const o = (y * png.width + x) * 4;
          r += png.data[o]!;
          g += png.data[o + 1]!;
          b += png.data[o + 2]!;
          n++;
        }
      return [r / n, g / n, b / n];
    };
    const water = await shoot(4, [27, 29], 'lake');
    const forest = await shoot(5, [96, 38], 'forest');
    const grass = await shoot(0, [64, 64], 'grass');
    const rock = await shoot(3, [64, 64], 'rock');
    console.log(art, JSON.stringify({ water, forest, grass, rock }));

    // lake: clearly bluish (blue dominates red and green)
    expect(water[2]).toBeGreaterThan(water[0] + 40);
    expect(water[2]).toBeGreaterThan(water[1] + 15);
    // forest: dark, green-ash (not blue, not bright)
    expect(lum(forest)).toBeLessThan(70);
    expect(forest[1]).toBeGreaterThanOrEqual(forest[0]);
    expect(forest[2]).toBeLessThan(forest[1] + 5);
    // walkable grass: brighter than forest and not blue
    expect(lum(grass)).toBeGreaterThan(lum(forest) + 25);
    expect(grass[2]).toBeLessThan(grass[1]);
    // obstacles differ from grass and from walkable rock by a wide colour margin
    for (const [n, c] of [
      ['water', water],
      ['forest', forest],
    ] as const)
      for (const [m, ref] of [
        ['grass', grass],
        ['rock', rock],
      ] as const)
        expect(dist(c, ref), `${n} vs ${m}`).toBeGreaterThan(45);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
