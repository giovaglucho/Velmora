import { describe, expect, it } from 'vitest';
import { depthKey } from '../../src/render/depth';

describe('depthKey (ADR-006 §4.4)', () => {
  it('matches the formula', () => {
    expect(depthKey(0, 0, 0)).toBe(0);
    expect(depthKey(128, 0, 0)).toBe(4096); // 1/8 tile in x+y = one bucket
    expect(depthKey(10_000, 5_000, 7)).toBe((15_000 >> 7) * 4096 + 7);
    expect(depthKey(0, 0, 4096 + 5)).toBe(5); // slot & 4095
    expect(depthKey(0, 0, 0, 2)).toBe(2 * 8 * 4096);
  });
  it('a unit further south (greater x+y) is in front, whatever its slot', () => {
    expect(depthKey(10_000, 10_500, 0)).toBeGreaterThan(depthKey(10_000, 10_000, 4095));
    expect(depthKey(30_000, 1_000, 1)).toBeGreaterThan(depthKey(10_000, 10_000, 3000)); // x+y = 31k > 20k
  });
  it('ties inside a bucket are ordered by slot, ascending (stable)', () => {
    const a = depthKey(5_000, 5_000, 3);
    const b = depthKey(5_050, 5_000, 4); // same 1/8-tile bucket
    expect(Math.floor(a / 4096)).toBe(Math.floor(b / 4096));
    expect(b).toBeGreaterThan(a);
  });
  it('is monotonic in x+y and strictly separates buckets', () => {
    let prev = -1;
    for (let s = 0; s <= 256_000; s += 37) {
      const k = depthKey(s, 0, 0);
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
  });
  it('elevation sorts above the whole ground span of 8 tiles of x+y', () => {
    expect(depthKey(0, 0, 0, 1)).toBeGreaterThan(depthKey(0, 0, 4095));
  });
});
