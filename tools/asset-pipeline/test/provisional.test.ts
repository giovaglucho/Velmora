import { describe, expect, it } from 'vitest';
import { loadGameData } from '@reinos/data';
import {
  ANIM_NAMES,
  AssetManifest,
  DIRS,
  INDICATOR,
  decodePng,
  frameName,
  generateAll,
  sha256,
  type Rgba,
} from '../src/index';

const files = generateAll();
const byName = new Map(files.map((f) => [f.name, f.bytes]));
const get = (n: string): Uint8Array => {
  const b = byName.get(n);
  if (!b) throw new Error('missing ' + n);
  return b;
};
const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

describe('determinism', () => {
  it('two runs give byte-identical files (same sha256 for every file)', () => {
    const again = generateAll();
    expect(again.map((f) => f.name)).toEqual(files.map((f) => f.name));
    for (let i = 0; i < files.length; i++) {
      expect(sha256(again[i]!.bytes), files[i]!.name).toBe(sha256(files[i]!.bytes));
    }
  });
});

describe('dimensions', () => {
  it('terrain textures are 512x512 POT, noise 256x256 POT, atlases POT', () => {
    for (const n of ['ground0', 'ground1', 'ground2', 'ground3', 'water']) {
      const im = decodePng(get(n + '.png'));
      expect([im.width, im.height], n).toEqual([512, 512]);
    }
    const noise = decodePng(get('noise.png'));
    expect([noise.width, noise.height]).toEqual([256, 256]);
    for (const n of ['units', 'buildings', 'ui']) {
      const im = decodePng(get(n + '.png'));
      expect(isPow2(im.width) && isPow2(im.height), n).toBe(true);
    }
  });
  it('total output stays within 3 MB', () => {
    const total = files.reduce((a, f) => a + f.bytes.length, 0);
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024);
  });
});

function meanAbsDiff(
  im: Rgba,
  a: (i: number) => number,
  b: (i: number) => number,
  n: number,
): number {
  let sum = 0;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 3; c++) sum += Math.abs(im.data[a(i) * 4 + c]! - im.data[b(i) * 4 + c]!);
  return sum / (n * 3);
}

describe('tileability', () => {
  for (const n of ['ground0', 'ground1', 'ground2', 'ground3', 'water', 'noise']) {
    it(n + ': opposite edges differ no more than neighbouring columns/rows', () => {
      const im = decodePng(get(n + '.png'));
      const { width: w, height: h } = im;
      const edgeX = meanAbsDiff(
        im,
        (y) => y * w,
        (y) => y * w + w - 1,
        h,
      );
      const edgeY = meanAbsDiff(
        im,
        (x) => x,
        (x) => (h - 1) * w + x,
        w,
      );
      // reference: average difference between adjacent columns/rows in the interior
      let refX = 0;
      let refY = 0;
      for (let k = 0; k < 16; k++) {
        const cx = 8 + k * 8;
        refX +=
          meanAbsDiff(
            im,
            (y) => y * w + cx,
            (y) => y * w + cx + 1,
            h,
          ) / 16;
        refY +=
          meanAbsDiff(
            im,
            (x) => cx * w + x,
            (x) => (cx + 1) * w + x,
            w,
          ) / 16;
      }
      expect(edgeX).toBeLessThanOrEqual(refX * 1.5 + 0.5);
      expect(edgeY).toBeLessThanOrEqual(refY * 1.5 + 0.5);
    });
  }
});

describe('manifest and atlases', () => {
  const manifest = AssetManifest.parse(JSON.parse(Buffer.from(get('manifest.json')).toString()));

  it('is valid, strict and its hashes match the files', () => {
    for (const [name, meta] of Object.entries(manifest.files)) {
      expect(sha256(get(name)), name).toBe(meta.sha256);
      expect(get(name).length).toBe(meta.bytes);
    }
    expect(() => AssetManifest.parse({ ...manifest, extra: 1 })).toThrow();
    expect(() => AssetManifest.parse({ ...manifest, dirs: 16 })).toThrow();
  });

  it('covers every sprite id of units.json and buildings.json', () => {
    const data = loadGameData();
    for (const u of data.units) expect(manifest.appearances[u.sprite], u.id).toBeDefined();
    for (const b of data.buildings) expect(manifest.appearances[b.sprite], b.id).toBe('building');
    expect(manifest.appearances['units/colono']).toBe('civil');
    expect(manifest.appearances['units/caballero']).toBe('cavalry');
    expect(manifest.appearances['units/arquero']).toBe('ranged');
    expect(manifest.appearances['units/recluta']).toBe('infantry');
  });

  const atlas = (n: string) => JSON.parse(Buffer.from(get(n + '.json')).toString());

  it('all referenced frames exist inside the image', () => {
    const units = atlas('units');
    const img = decodePng(get('units.png'));
    for (const app of ['civil', 'infantry', 'ranged', 'cavalry', 'generic'])
      for (const layer of ['body', 'team'] as const)
        for (let d = 0; d < DIRS; d++)
          for (const a of ANIM_NAMES) {
            const f = units.frames[frameName(app, layer, d, a)];
            expect(f, frameName(app, layer, d, a)).toBeDefined();
            expect(f.frame.w).toBe(64);
            expect(f.frame.h).toBe(96);
            expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(img.width);
            expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(img.height);
          }
    const b = atlas('buildings');
    for (const layer of ['body', 'team'] as const)
      for (let d = 0; d < DIRS; d++)
        expect(b.frames[frameName('building', layer, d, 'idle0')]).toBeDefined();
    expect(Object.keys(atlas('ui').frames).sort()).toEqual(
      ['dot', 'marker0', 'marker1', 'marker2', 'marker3', 'ring'].sort(),
    );
  });

  /** Centroid of indicator-coloured pixels of a body frame, relative to the 64x96 frame. */
  function indicatorCentroid(dir: number): [number, number] {
    const units = atlas('units');
    const img = decodePng(get('units.png'));
    const f = units.frames[frameName('civil', 'body', dir, 'idle0')].frame;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const o = ((f.y + y) * img.width + f.x + x) * 4;
        const d =
          Math.abs(img.data[o]! - INDICATOR[0]) +
          Math.abs(img.data[o + 1]! - INDICATOR[1]) +
          Math.abs(img.data[o + 2]! - INDICATOR[2]);
        if (img.data[o + 3]! > 200 && d < 30) {
          sx += x;
          sy += y;
          n++;
        }
      }
    expect(n).toBeGreaterThan(3);
    return [sx / n, sy / n];
  }

  it('direction 0 points down-right on screen (+x grid), per ADR-006 §4.7', () => {
    const [x, y] = indicatorCentroid(0);
    expect(x).toBeGreaterThan(32 + 3); // right of the body axis
    expect(y).toBeGreaterThan(43); // below head centre (head at y=43)
  });
  it('direction 4 (-x grid) points up-left; dir 2 (+y grid) down-left; dir 6 up-right', () => {
    const [x4, y4] = indicatorCentroid(4);
    expect(x4).toBeLessThan(32 - 3);
    expect(y4).toBeLessThan(43);
    const [x2, y2] = indicatorCentroid(2);
    expect(x2).toBeLessThan(32 - 3);
    expect(y2).toBeGreaterThan(43);
    const [x6, y6] = indicatorCentroid(6);
    expect(x6).toBeGreaterThan(32 + 3);
    expect(y6).toBeLessThan(43);
  });

  it('team layer is non-empty white-only and body layer is not tinted by team colour', () => {
    const units = atlas('units');
    const img = decodePng(get('units.png'));
    const f = units.frames[frameName('infantry', 'team', 0, 'idle0')].frame;
    let opaque = 0;
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const o = ((f.y + y) * img.width + f.x + x) * 4;
        if (img.data[o + 3]! > 0) {
          opaque++;
          expect(img.data[o]).toBe(255);
          expect(img.data[o + 1]).toBe(255);
          expect(img.data[o + 2]).toBe(255);
        }
      }
    expect(opaque).toBeGreaterThan(20);
  });
});
