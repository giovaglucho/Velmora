// Fixed-point integer arithmetic (ADR-003, ADR-005 §1-2). This is the ONLY file where `/` is
// allowed freely (lint:sim exempts this exact path). Every function is pure, allocation-free
// and truncates toward zero. All operands are integers.
import { ATAN_OCTANT, SIN_QUARTER } from './trig-tables';

export type Fx = number; // integer; unit = 1/1000 of a tile

export const FX_SCALE = 1000; // = economy.fixedScale (checked by a test against @reinos/data)
export const FX_ONE: Fx = 1000;
export const FX_HALF: Fx = 500;
export const TILE_FX: Fx = 1000;
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 50;
export const TURN_TICKS = 4;
export const ANGLE_STEPS = 1024;
export const ANGLE_MASK = 1023;
export const TRIG_ONE = 16384;
export const TRIG_SHIFT = 14;
export const FX_MAX_OPERAND = 1048575; // 2^20 - 1
/** Largest valid world coordinate (512 tiles). Sim coordinates are never negative. */
export const MAX_COORD_FX = 512_000;

const TWO_POW_32 = 4294967296;

/**
 * Exact truncating division of integers: (p - p % c) / c. `p % c` is exact in IEEE-754 for
 * integers and keeps the sign of `p`, so the numerator is an exact multiple of `c` and the
 * final division is exact (the result is representable). `+ 0` normalizes -0 to +0.
 */
function truncDiv(p: number, c: number): number {
  return (p - (p % c)) / c + 0;
}

export function fxFromInt(n: number): Fx {
  return n * FX_SCALE;
}

export function fxToInt(a: Fx): number {
  return truncDiv(a, FX_SCALE);
}

export function mulDiv(a: number, b: number, c: number): number {
  if (c === 0) throw new RangeError('mulDiv: division by zero');
  return truncDiv(a * b, c);
}

export function fxMul(a: Fx, b: Fx): Fx {
  return truncDiv(a * b, FX_SCALE);
}

export function fxDiv(a: Fx, b: Fx): Fx {
  if (b === 0) throw new RangeError('fxDiv: division by zero');
  return truncDiv(a * FX_SCALE, b);
}

/** Bit length of a non-negative integer below 2^53 (0 for 0). */
function bitLength(n: number): number {
  if (n < TWO_POW_32) return 32 - Math.clz32(n);
  const hi = truncDiv(n, TWO_POW_32);
  return 64 - Math.clz32(hi);
}

/** floor(sqrt(n)) EXACT for integer n in [0, 2^53). Integer Newton iteration; no Math.sqrt. */
export function isqrt(n: number): number {
  if (n < 2) return n < 0 ? 0 : n;
  // 2^ceil(bits/2) >= sqrt(n); Newton from above decreases monotonically to floor(sqrt(n)).
  let x = 1 << ((bitLength(n) + 1) >> 1);
  for (;;) {
    const y = (x + truncDiv(n, x)) >> 1; // x <= 2^27 so the sum fits in int32 range
    if (y >= x) return x;
    x = y;
  }
}

export function fxSqrt(a: Fx): Fx {
  return isqrt(a * FX_SCALE);
}

export function distSq(dx: Fx, dy: Fx): number {
  return dx * dx + dy * dy;
}

export function dist(dx: Fx, dy: Fx): Fx {
  return isqrt(dx * dx + dy * dy);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function fxToTile(a: Fx): number {
  return truncDiv(a, TILE_FX);
}

export function tileToFx(t: number): Fx {
  return t * TILE_FX;
}

export function tileCenterFx(t: number): Fx {
  return t * TILE_FX + FX_HALF;
}

export function sinT(angle: number): number {
  const a = angle & ANGLE_MASK;
  const q = a >> 8;
  const i = a & 255;
  switch (q) {
    case 0:
      return SIN_QUARTER[i] as number;
    case 1:
      return SIN_QUARTER[256 - i] as number;
    case 2:
      return -(SIN_QUARTER[i] as number) + 0;
    default:
      return -(SIN_QUARTER[256 - i] as number) + 0;
  }
}

export function cosT(angle: number): number {
  return sinT(angle + 256);
}

export function mulTrig(v: number, t: number): number {
  return truncDiv(v * t, TRIG_ONE);
}

/** Angle 0..1023; 0 = +x (east), grows toward +y (south); (0,0) -> 0. */
export function atan2Idx(dy: Fx, dx: Fx): number {
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  if (ax === 0 && ay === 0) return 0;
  const steep = ay > ax;
  const max = steep ? ay : ax;
  const min = steep ? ax : ay;
  // ratio rounded to nearest 1/256 (truncating it would allow up to ~1.14 steps of error)
  const octant = ATAN_OCTANT[truncDiv(min * 512 + max, 2 * max)] as number; // 0..128
  const base = steep ? 256 - octant : octant; // angle of (|dx|,|dy|) within the first quadrant
  if (dy >= 0) return dx >= 0 ? base : 512 - base;
  return dx >= 0 ? (1024 - base) & ANGLE_MASK : 512 + base;
}
