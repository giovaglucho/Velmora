import { describe, expect, it } from 'vitest';
import { MAX_INTERP_JUMP_FX } from '../../src/render/constants';
import { createFakeFeed } from '../../src/render/harness/fakeFeed';
import { FLAG_ALIVE } from '../../src/worker/snapshot';

describe('fake snapshot feed (stand-in for the worker)', () => {
  it('is deterministic, stays inside the map and never produces a jump the render would skip', () => {
    const a = createFakeFeed({ units: 400, mapW: 64, mapH: 64, seed: 4 });
    const b = createFakeFeed({ units: 400, mapW: 64, mapH: 64, seed: 4 });
    for (let t = 0; t < 600; t++) {
      a.step(t * 50);
      b.step(t * 50);
    }
    expect(a.view.posX).toEqual(b.view.posX);
    expect(a.view.tick).toBe(600);
    expect(a.latestArrivalMs).toBe(599 * 50);
    for (let s = 0; s < 400; s++) {
      expect((a.view.flags[s] ?? 0) & FLAG_ALIVE).toBe(1);
      expect(a.view.posX[s]).toBeGreaterThanOrEqual(0);
      expect(a.view.posX[s]).toBeLessThan(64_000);
      expect(Math.abs((a.view.posX[s] ?? 0) - (a.view.prevX[s] ?? 0))).toBeLessThan(
        MAX_INTERP_JUMP_FX,
      );
    }
    expect(a.view.eid(5)).toBe((1 << 16) | 5);
  });
});
