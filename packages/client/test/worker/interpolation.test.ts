import { describe, expect, it } from 'vitest';
import { interpAlpha, interpolateSlot, isDiscontinuity } from '../../src/worker/interpolation';
import type { SnapshotView } from '../../src/worker/snapshot';

function view(
  over: Partial<Record<'posX' | 'posY' | 'prevX' | 'prevY' | 'flags', number>>,
): SnapshotView {
  const v = {
    posX: Int32Array.of(over.posX ?? 0),
    posY: Int32Array.of(over.posY ?? 0),
    prevX: Int32Array.of(over.prevX ?? 0),
    prevY: Int32Array.of(over.prevY ?? 0),
    flags: Uint8Array.of(over.flags ?? 1),
  };
  return v as unknown as SnapshotView;
}
const MAX = 4000;

describe('interpAlpha', () => {
  it('is 0 at arrival, 0.5 at half a tick, saturates at 1 (no extrapolation)', () => {
    expect(interpAlpha(100, 100, 50_000)).toBe(0);
    expect(interpAlpha(125, 100, 50_000)).toBeCloseTo(0.5, 12);
    expect(interpAlpha(150, 100, 50_000)).toBe(1);
    expect(interpAlpha(1000, 100, 50_000)).toBe(1);
  });
  it('clamps negative elapsed time to 0 and follows the tick interval (speed)', () => {
    expect(interpAlpha(90, 100, 50_000)).toBe(0);
    expect(interpAlpha(110, 100, 29_412)).toBeCloseTo(10 / 29.412, 9);
    expect(interpAlpha(110, 100, 0)).toBe(1);
  });
  it('is monotonic non-decreasing in time', () => {
    let prev = -1;
    for (let t = 0; t <= 80; t += 3) {
      const a = interpAlpha(t, 0, 50_000);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe('interpolateSlot', () => {
  const out = { x: 0, y: 0 };
  it('lerps prev -> pos', () => {
    const v = view({ prevX: 1000, prevY: 2000, posX: 1100, posY: 1900 });
    interpolateSlot(v, 0, 0, MAX, true, out);
    expect(out).toEqual({ x: 1000, y: 2000 });
    interpolateSlot(v, 0, 0.5, MAX, true, out);
    expect(out).toEqual({ x: 1050, y: 1950 });
    interpolateSlot(v, 0, 1, MAX, true, out);
    expect(out).toEqual({ x: 1100, y: 1900 });
  });
  it('does not interpolate a jump larger than the limit on either axis', () => {
    const v = view({ prevX: 1000, prevY: 1000, posX: 6000, posY: 1000 });
    expect(isDiscontinuity(v, 0, MAX, true)).toBe(true);
    interpolateSlot(v, 0, 0.5, MAX, true, out);
    expect(out).toEqual({ x: 6000, y: 1000 });
    expect(isDiscontinuity(view({ prevY: 0, posY: 4000 }), 0, MAX, true)).toBe(false);
    expect(isDiscontinuity(view({ prevY: 0, posY: -4001 }), 0, MAX, true)).toBe(true);
  });
  it('jumps for a slot that just became alive, and for dead slots', () => {
    const v = view({ prevX: 0, posX: 100 });
    expect(isDiscontinuity(v, 0, MAX, false)).toBe(true);
    interpolateSlot(v, 0, 0.5, MAX, false, out);
    expect(out.x).toBe(100);
    expect(isDiscontinuity(view({ prevX: 0, posX: 100, flags: 0 }), 0, MAX, true)).toBe(true);
  });
});
