import { describe, expect, it } from 'vitest';
import {
  FX_HALF,
  FX_MAX_OPERAND,
  FX_ONE,
  FX_SCALE,
  MAX_COORD_FX,
  TILE_FX,
  TURN_TICKS,
  TICKS_PER_SECOND,
  TICK_MS,
  ANGLE_STEPS,
  ANGLE_MASK,
  TRIG_ONE,
  TRIG_SHIFT,
  clamp,
  createPrng,
  dist,
  distSq,
  fxDiv,
  fxFromInt,
  fxMul,
  fxSqrt,
  fxToInt,
  fxToTile,
  isqrt,
  mulDiv,
  tileCenterFx,
  tileToFx,
} from '../src/index';

const rng = createPrng(0xf1ced);
/** Uniform integer in [lo, hi] (range up to 2^53). */
function rand(lo: number, hi: number): number {
  const span = hi - lo + 1;
  if (span <= 0x100000000) return lo + rng.nextInt(span);
  const hiPart = Math.floor(span / 0x100000000);
  for (;;) {
    const v = rng.nextInt(hiPart + 1) * 0x100000000 + rng.nextU32();
    if (v < span) return lo + v;
  }
}
const big = (n: number) => BigInt(n);

function expectIsqrt(n: number) {
  const r = isqrt(n);
  const N = big(n);
  const R = big(r);
  if (!(R * R <= N && N < (R + 1n) * (R + 1n))) throw new Error(`isqrt(${n}) = ${r} is wrong`);
}

describe('constants', () => {
  it('match ADR-005 §1', () => {
    expect([FX_SCALE, FX_ONE, FX_HALF, TILE_FX]).toEqual([1000, 1000, 500, 1000]);
    expect([TICKS_PER_SECOND, TICK_MS, TURN_TICKS]).toEqual([20, 50, 4]);
    expect([ANGLE_STEPS, ANGLE_MASK, TRIG_ONE, TRIG_SHIFT]).toEqual([1024, 1023, 16384, 14]);
    expect(1 << TRIG_SHIFT).toBe(TRIG_ONE);
    expect(FX_MAX_OPERAND).toBe(2 ** 20 - 1);
    expect(MAX_COORD_FX).toBe(512 * TILE_FX);
  });
});

describe('isqrt (exact vs BigInt)', () => {
  it('borders', () => {
    const borders = [0, 1, 2, 3, 4, 2 ** 53 - 1, 2 ** 53 - 2];
    for (let k = 1; k < 53; k++) borders.push(2 ** k - 1, 2 ** k, 2 ** k + 1);
    for (let r = 1; r <= 94906265; r = r * 3 + 1) borders.push(r * r - 1, r * r, r * r + 1);
    for (const n of borders) if (n < 2 ** 53) expectIsqrt(n);
    expect(isqrt(2 ** 53 - 1)).toBe(94906265);
    expect(isqrt(0)).toBe(0);
    expect(isqrt(1)).toBe(1);
    expect(isqrt(24)).toBe(4);
    expect(isqrt(25)).toBe(5);
  });
  it('perfect squares and neighbours around the top of the range', () => {
    for (let r = 94906265; r > 94906265 - 2000; r--) {
      expect(isqrt(r * r)).toBe(r);
      expect(isqrt(r * r - 1)).toBe(r - 1);
      if (r * r + 2 * r < 2 ** 53) expect(isqrt(r * r + 2 * r)).toBe(r);
    }
  });
  it('1,000,000 seeded random values across magnitudes', () => {
    for (let i = 0; i < 1_000_000; i++) {
      const bits = 1 + rng.nextInt(53);
      expectIsqrt(rand(0, 2 ** bits - 1));
    }
  }, 120_000);
});

describe('fxMul / fxDiv / mulDiv (exact vs BigInt, truncating toward zero)', () => {
  const M = FX_MAX_OPERAND;
  const refMul = (a: number, b: number) => Number((big(a) * big(b)) / 1000n);
  const refDiv = (a: number, b: number) => Number((big(a) * 1000n) / big(b));

  it('fxMul random + borders (incl. negatives)', () => {
    const edge = [0, 1, -1, 2, -2, 999, 1000, 1001, -999, -1000, -1001, M, -M, M - 1, 1 - M];
    for (const a of edge) for (const b of edge) expect(fxMul(a, b)).toBe(refMul(a, b));
    for (let i = 0; i < 300_000; i++) {
      const a = rand(-M, M);
      const b = rand(-M, M);
      expect(fxMul(a, b)).toBe(refMul(a, b));
    }
  }, 60_000);
  it('fxDiv random + borders (incl. negatives)', () => {
    const edge = [0, 1, -1, 2, -2, 999, 1000, 1001, -999, -1000, M, -M, 3, -3, 7];
    for (const a of edge) for (const b of edge) if (b !== 0) expect(fxDiv(a, b)).toBe(refDiv(a, b));
    for (let i = 0; i < 300_000; i++) {
      const a = rand(-M, M);
      let b = rand(-M, M);
      if (b === 0) b = 1;
      expect(fxDiv(a, b)).toBe(refDiv(a, b));
    }
  }, 60_000);
  it('mulDiv random over |a*b| <= 2^40 and wide divisors', () => {
    for (let i = 0; i < 300_000; i++) {
      const a = rand(-M, M);
      const b = rand(-M, M);
      let c = rand(-(2 ** 40), 2 ** 40);
      if (c === 0) c = -1;
      expect(mulDiv(a, b, c)).toBe(Number((big(a) * big(b)) / big(c)));
    }
    // largest allowed product with small divisors
    expect(mulDiv(2 ** 20, 2 ** 20, 3)).toBe(Number(2n ** 40n / 3n));
    expect(mulDiv(-(2 ** 20), 2 ** 20, 3)).toBe(-Number(2n ** 40n / 3n));
  }, 60_000);
  it('truncates toward zero, never floors', () => {
    expect(fxMul(1500, -1)).toBe(-1); // -1.5 -> -1
    expect(fxMul(-1500, 1)).toBe(-1);
    expect(fxMul(-1500, -1)).toBe(1);
    expect(fxMul(1, 999)).toBe(0);
    expect(fxDiv(-1, 3)).toBe(-333);
    expect(fxDiv(1, -3)).toBe(-333);
    expect(fxDiv(-1, -3)).toBe(333);
    expect(mulDiv(-7, 1, 2)).toBe(-3);
    expect(mulDiv(7, 1, -2)).toBe(-3);
    expect(fxToInt(-1999)).toBe(-1);
    expect(fxToInt(1999)).toBe(1);
    expect(fxToInt(-999)).toBe(0);
  });
  it('never returns -0', () => {
    expect(Object.is(fxMul(-1, 1), 0)).toBe(true);
    expect(Object.is(fxMul(0, -5), 0)).toBe(true);
    expect(Object.is(fxDiv(0, -5), 0)).toBe(true);
    expect(Object.is(mulDiv(0, 3, -7), 0)).toBe(true);
    expect(Object.is(fxToInt(-1), 0)).toBe(true);
  });
  it('identities', () => {
    expect(fxMul(FX_ONE, 12345)).toBe(12345);
    expect(fxDiv(12345, FX_ONE)).toBe(12345);
    expect(fxMul(fxFromInt(3), fxFromInt(4))).toBe(fxFromInt(12));
    expect(fxDiv(fxFromInt(12), fxFromInt(4))).toBe(fxFromInt(3));
  });
  it('zero divisors throw RangeError', () => {
    expect(() => fxDiv(1000, 0)).toThrow(RangeError);
    expect(() => mulDiv(1, 2, 0)).toThrow(RangeError);
  });
});

describe('distances and conversions', () => {
  it('distSq / dist / fxSqrt', () => {
    expect(distSq(3000, 4000)).toBe(25_000_000);
    expect(dist(3000, 4000)).toBe(5000);
    expect(dist(-3000, 4000)).toBe(5000);
    expect(dist(0, 0)).toBe(0);
    expect(fxSqrt(2000)).toBe(1414);
    expect(fxSqrt(fxFromInt(4))).toBe(fxFromInt(2));
    const L = 2 ** 25;
    expect(distSq(L, L)).toBe(2 ** 51);
    for (let i = 0; i < 50_000; i++) {
      const dx = rand(-L, L);
      const dy = rand(-L, L);
      const exp = big(dx) * big(dx) + big(dy) * big(dy);
      expect(distSq(dx, dy)).toBe(Number(exp));
      expectIsqrt(distSq(dx, dy));
      expect(dist(dx, dy)).toBe(isqrt(distSq(dx, dy)));
    }
  });
  it('fxSqrt(a) = isqrt(a * 1000) for non-negative a', () => {
    for (let i = 0; i < 20_000; i++) {
      const a = rand(0, 2 ** 40);
      expect(fxSqrt(a)).toBe(isqrt(a * 1000));
    }
  });
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(0, 0, 0)).toBe(0);
  });
  it('tile helpers', () => {
    expect(fxFromInt(7)).toBe(7000);
    expect(fxFromInt(-7)).toBe(-7000);
    expect(fxToTile(0)).toBe(0);
    expect(fxToTile(999)).toBe(0);
    expect(fxToTile(1000)).toBe(1);
    expect(fxToTile(MAX_COORD_FX)).toBe(512);
    expect(tileToFx(3)).toBe(3000);
    expect(tileCenterFx(3)).toBe(3500);
    for (let t = 0; t < 512; t++) {
      expect(fxToTile(tileToFx(t))).toBe(t);
      expect(fxToTile(tileCenterFx(t))).toBe(t);
      expect(fxToTile(tileToFx(t + 1) - 1)).toBe(t);
    }
  });
});
