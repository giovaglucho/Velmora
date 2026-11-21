import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import { clampGrid, gridToMinimap, minimapToGrid } from '../../../src/render/minimap/mapping';
import { applyFog, buildTileIndex, rasterTerrain } from '../../../src/render/minimap/raster';
import { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE } from '../../../src/render/fog/visionGrid';

const W = 256;
const H = 128;

describe('minimap mapping', () => {
  it('diamond vertices map to the minimap edge midpoints (square map)', () => {
    const m = (gx: number, gy: number) => gridToMinimap(gx, gy, 128, 128, W, H);
    expect(m(0, 0)).toEqual({ x: 128, y: 0 }); // top
    expect(m(128, 0)).toEqual({ x: 256, y: 64 }); // right
    expect(m(128, 128)).toEqual({ x: 128, y: 128 }); // bottom
    expect(m(0, 128)).toEqual({ x: 0, y: 64 }); // left
    expect(m(64, 64)).toEqual({ x: 128, y: 64 }); // centre
  });
  it('non-square map still fills the 2:1 box', () => {
    const m = (gx: number, gy: number) => gridToMinimap(gx, gy, 96, 32, W, H);
    expect(m(0, 0).y).toBe(0);
    expect(m(96, 32).y).toBe(H);
    expect(m(96, 0).x).toBe(W);
    expect(m(0, 32).x).toBe(0);
  });
  it('round trip grid -> minimap -> grid and back, 10^4 random points, several map sizes', () => {
    const prng = createPrng(99);
    for (const [mw, mh] of [
      [128, 128],
      [64, 64],
      [96, 32],
      [37, 29],
    ] as const) {
      for (let i = 0; i < 2500; i++) {
        const gx = (prng.nextInt(1_000_000) / 1_000_000) * mw;
        const gy = (prng.nextInt(1_000_000) / 1_000_000) * mh;
        const m = gridToMinimap(gx, gy, mw, mh, W, H);
        const g = minimapToGrid(m.x, m.y, mw, mh, W, H);
        expect(Math.abs(g.x - gx)).toBeLessThan(1e-9);
        expect(Math.abs(g.y - gy)).toBeLessThan(1e-9);
        const px = (prng.nextInt(W * 100) / 100) | 0;
        const py = (prng.nextInt(H * 100) / 100) | 0;
        const g2 = minimapToGrid(px, py, mw, mh, W, H);
        const m2 = gridToMinimap(g2.x, g2.y, mw, mh, W, H);
        expect(Math.abs(m2.x - px)).toBeLessThan(1e-9);
        expect(Math.abs(m2.y - py)).toBeLessThan(1e-9);
      }
    }
  });
  it('minimap box corners are outside the diamond; clampGrid brings them back into the map', () => {
    const g = minimapToGrid(0, 0, 128, 128, W, H); // top-left corner of the box
    expect(g).toEqual({ x: -64, y: 64 });
    expect(clampGrid(g.x, g.y, 128, 128)).toEqual({ x: 0, y: 64 });
    expect(clampGrid(-5, 200, 128, 128)).toEqual({ x: 0, y: 128 });
  });
});

describe('minimap raster (pure pixels)', () => {
  const MW = 32;
  const index = buildTileIndex(MW, MW, W, H);
  it('tile index: centre pixel -> centre tile, box corners outside', () => {
    expect(index[0]).toBe(-1);
    expect(index[W - 1]).toBe(-1);
    expect(index[(H - 1) * W]).toBe(-1);
    const centre = index[64 * W + 128] as number;
    expect(centre).toBeGreaterThanOrEqual(0);
    const ty = Math.floor(centre / MW);
    const tx = centre % MW;
    expect(Math.abs(tx - 16)).toBeLessThanOrEqual(1);
    expect(Math.abs(ty - 16)).toBeLessThanOrEqual(1);
    // roughly half of the 2:1 box is inside the diamond
    let inside = 0;
    for (const t of index) if (t >= 0) inside++;
    expect(inside / index.length).toBeGreaterThan(0.45);
    expect(inside / index.length).toBeLessThan(0.55);
  });
  it('terrain + fog: visible keeps colour, explored is darkened, unexplored is near black; outside stays transparent', () => {
    const base = new Uint8ClampedArray(W * H * 4);
    rasterTerrain(index, () => 0x40c040, base);
    const out = new Uint8ClampedArray(W * H * 4);
    const fog = new Uint8Array(MW * MW);
    const centre = index[64 * W + 128] as number;
    fog.fill(FOG_UNEXPLORED);
    fog[centre] = FOG_VISIBLE;
    const other = index[64 * W + 160] as number;
    fog[other] = FOG_EXPLORED;
    applyFog(base, index, fog, out);
    const px = (x: number, y: number) => {
      const o = (y * W + x) * 4;
      return [out[o], out[o + 1], out[o + 2], out[o + 3]];
    };
    expect(px(128, 64)).toEqual([0x40, 0xc0, 0x40, 255]);
    const ex = px(160, 64) as number[];
    expect(ex[1]).toBeLessThan(0xc0 * 0.6);
    expect(ex[1]).toBeGreaterThan(20);
    const un = px(100, 64) as number[];
    expect(Math.max(un[0] as number, un[1] as number, un[2] as number)).toBeLessThan(16); // the fog colour itself is (5,8,13)
    expect(px(0, 0)[3]).toBe(0);
    applyFog(base, index, null, out);
    expect(px(100, 64)).toEqual([0x40, 0xc0, 0x40, 255]);
  });
});
