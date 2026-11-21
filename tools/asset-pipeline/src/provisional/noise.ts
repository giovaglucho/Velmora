/**
 * Periodic (toroidal) value noise. Only +, -, * and floor are used (no transcendental functions),
 * so output is bit-stable across machines and Node versions. Coordinates are in [0,1) texture space.
 */

/** 32-bit integer hash of a lattice point and seed -> [0,1). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h =
    (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise with `px` x `py` lattice cells over the unit square; wraps seamlessly. */
export function vnoise(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const xa = ((x0 % px) + px) % px;
  const ya = ((y0 % py) + py) % py;
  const xb = (xa + 1) % px;
  const yb = (ya + 1) % py;
  const a = hash2(xa, ya, seed);
  const b = hash2(xb, ya, seed);
  const c = hash2(xa, yb, seed);
  const d = hash2(xb, yb, seed);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/** Multi-octave periodic noise in [0,1]; `basePeriod` doubles per octave. */
export function fbm(
  u: number,
  v: number,
  basePeriodX: number,
  basePeriodY: number,
  octaves: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = basePeriodX;
  let py = basePeriodY;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u, v, px, py, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}
