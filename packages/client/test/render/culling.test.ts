import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import { createCamera } from '../../src/render/camera';
import { ZOOMS } from '../../src/render/constants';
import { spriteVisible, visibleChunks, visibleTileRange } from '../../src/render/culling';
import { gridToWorld, worldToScreen } from '../../src/render/iso';

describe('visibleTileRange (ADR-006 §4.3)', () => {
  it('is a superset of the exact visible tiles (brute force, 10^4 random cameras/maps)', () => {
    const rng = createPrng(2024);
    let checkedTiles = 0;
    let positives = 0;
    for (let n = 0; n < 10_000; n++) {
      const mapW = 8 + rng.nextInt(120);
      const mapH = 8 + rng.nextInt(120);
      const vp = { vw: 320 + rng.nextInt(1700), vh: 240 + rng.nextInt(900) };
      const cam = createCamera();
      cam.zoomT = ZOOMS[rng.nextInt(3)] as number;
      const c = gridToWorld(rng.nextInt(mapW * 100) / 100 - 3, rng.nextInt(mapH * 100) / 100 - 3);
      cam.x = c.x;
      cam.y = c.y;
      const r = visibleTileRange(cam, vp, mapW, mapH, 0);
      // sample a subset of tiles per case to keep the test fast; every tile that has ANY of 5 sample
      // points (4 corners + centre) inside the viewport must be in the range
      for (let k = 0; k < 40; k++) {
        const tx = rng.nextInt(mapW);
        const ty = rng.nextInt(mapH);
        let seen = false;
        for (const [ox, oy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
          [0.5, 0.5],
        ] as const) {
          const w = gridToWorld(tx + ox, ty + oy);
          const s = worldToScreen(cam, vp, w.x, w.y);
          if (s.x >= 0 && s.x <= vp.vw && s.y >= 0 && s.y <= vp.vh) seen = true;
        }
        checkedTiles++;
        if (seen) {
          positives++;
          expect(
            tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1,
            `tile ${tx},${ty} ∉ ${JSON.stringify(r)}`,
          ).toBe(true);
        }
      }
    }
    expect(checkedTiles).toBe(400_000);
    expect(positives).toBeGreaterThan(20_000); // the check is not vacuous
  });
  it('is clipped to the map and not larger than the viewport AABB + margin', () => {
    const cam = createCamera();
    const c = gridToWorld(64, 64);
    cam.x = c.x;
    cam.y = c.y;
    const vp = { vw: 1280, vh: 720 };
    const r0 = visibleTileRange(cam, vp, 128, 128, 0);
    const r2 = visibleTileRange(cam, vp, 128, 128, 2);
    expect(r2.x0).toBe(r0.x0 - 2);
    expect(r2.y1).toBe(r0.y1 + 2);
    expect(r0.x0).toBeGreaterThanOrEqual(0);
    expect(r0.x1).toBeLessThanOrEqual(127);
    // 1280×720 at zoom 1 spans 1280/128 + 720/64 = 21.25 tiles on each grid axis (AABB) at most
    expect(r0.x1 - r0.x0 + 1).toBeLessThanOrEqual(23);
    const c2 = gridToWorld(2, 2);
    cam.x = c2.x;
    cam.y = c2.y;
    const tiny = visibleTileRange(cam, vp, 4, 4, 0);
    expect(tiny.x0).toBe(0);
    expect(tiny.x1).toBe(3);
  });
  it('is empty when the camera looks away from the map', () => {
    const cam = createCamera();
    const c = gridToWorld(500, 500);
    cam.x = c.x;
    cam.y = c.y;
    const r = visibleTileRange(cam, { vw: 1280, vh: 720 }, 128, 128, 1);
    expect(r.x1 < r.x0 || r.y1 < r.y0).toBe(true);
    const ch = visibleChunks(r);
    expect(ch.x1 < ch.x0).toBe(true);
  });
});

describe('visibleChunks', () => {
  it('maps tile ranges to 16×16 chunks, including map edges not multiple of 16', () => {
    expect(visibleChunks({ x0: 0, y0: 0, x1: 15, y1: 15 })).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
    expect(visibleChunks({ x0: 15, y0: 16, x1: 32, y1: 47 })).toEqual({
      x0: 0,
      y0: 1,
      x1: 2,
      y1: 2,
    });
    // 100-tile map: last tile 99 is in chunk 6 (cx 0..6 → 7 chunks)
    expect(visibleChunks({ x0: 0, y0: 0, x1: 99, y1: 99 })).toEqual({ x0: 0, y0: 0, x1: 6, y1: 6 });
  });
});

describe('spriteVisible', () => {
  const vp = { vw: 1000, vh: 600 };
  it('keeps sprites intersecting the viewport (with 16 px margin), anchored at the foot', () => {
    expect(spriteVisible(500, 300, 1, vp)).toBe(true);
    // foot just above the top: the body (84 px above the foot is irrelevant, below the foot only 12 px)
    expect(spriteVisible(500, -12 - 16 - 1, 1, vp)).toBe(false);
    expect(spriteVisible(500, -12 - 16 + 1, 1, vp)).toBe(true);
    // foot below the bottom: the body extends 84.5 px above it
    expect(spriteVisible(500, 600 + 84 + 16 - 1, 1, vp)).toBe(true);
    expect(spriteVisible(500, 600 + 85 + 16 + 1, 1, vp)).toBe(false);
    // sides: half width 32 px + 16
    expect(spriteVisible(-32 - 16 - 1, 300, 1, vp)).toBe(false);
    expect(spriteVisible(-32 - 16 + 1, 300, 1, vp)).toBe(true);
    expect(spriteVisible(1000 + 48 + 1, 300, 1, vp)).toBe(false);
  });
  it('scales with zoom', () => {
    expect(spriteVisible(-60, 300, 1.4, vp)).toBe(true); // half width 44.8 + 16 = 60.8
    expect(spriteVisible(-60, 300, 0.6, vp)).toBe(false); // 19.2 + 16 = 35.2
  });
});
