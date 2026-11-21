import { createPrng } from '@reinos/shared';
import { fbm, hash2 } from './noise.js';
import { createRgba, type Rgba } from './png.js';

export const GROUND_SIZE = 512;
export const NOISE_SIZE = 256;

/** Order matters: ground0..3 are the splatting layers of ADR-006 §4.6; water is an extra provisional tile. */
export const GROUND_NAMES = ['grass', 'dirt', 'sand', 'ash', 'water'] as const;
export type GroundName = (typeof GROUND_NAMES)[number];

/** Output file for each terrain texture. ground0..3 follow ADR-006 §9; water is separate. */
export const GROUND_FILES: Record<GroundName, string> = {
  grass: 'ground0.png',
  dirt: 'ground1.png',
  sand: 'ground2.png',
  ash: 'ground3.png',
  water: 'water.png',
};

type Rgb = readonly [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

interface Palette {
  dark: Rgb;
  light: Rgb;
  /** Second hue blended in by a low-frequency mask. */
  alt: Rgb;
  speckle: number;
}

const PALETTES: Record<Exclude<GroundName, 'water'>, Palette> = {
  grass: { dark: [58, 96, 38], light: [112, 148, 64], alt: [128, 146, 60], speckle: 14 },
  dirt: { dark: [92, 66, 44], light: [146, 108, 72], alt: [120, 92, 60], speckle: 12 },
  sand: { dark: [190, 168, 116], light: [226, 206, 150], alt: [208, 180, 128], speckle: 10 },
  ash: { dark: [58, 56, 58], light: [112, 108, 106], alt: [84, 80, 84], speckle: 12 },
};

/**
 * Seamlessly tileable terrain texture. `seed` is derived from the fixed asset seed by the caller;
 * every noise lattice wraps, so opposite edges are continuous.
 */
export function generateGround(name: GroundName, seed: number): Rgba {
  const size = GROUND_SIZE;
  const img = createRgba(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let r: number;
      let g: number;
      let b: number;
      if (name === 'water') {
        // Horizontally stretched ripples plus soft highlights.
        const w = fbm(u, v, 4, 16, 4, seed);
        const ripple = fbm(u, v, 8, 48, 3, seed + 7);
        const t = w * 0.6 + ripple * 0.4;
        const c = mix([24, 70, 120], [66, 128, 176], t);
        const glint = ripple > 0.66 ? (ripple - 0.66) * 3.2 : 0;
        r = c[0] + glint * 70;
        g = c[1] + glint * 70;
        b = c[2] + glint * 60;
      } else {
        const p = PALETTES[name];
        let n = fbm(u, v, 4, 4, 5, seed);
        if (name === 'ash') {
          // Dark cracks: ridged noise.
          const ridge = fbm(u, v, 6, 6, 3, seed + 31);
          const crack = 1 - Math.abs(ridge - 0.5) * 2;
          if (crack > 0.9) n -= (crack - 0.9) * 3.5;
        }
        const t = n < 0 ? 0 : n > 1 ? 1 : n;
        const hue = fbm(u, v, 2, 2, 2, seed + 13);
        const base = mix(mix(p.dark, p.light, t), p.alt, hue * 0.5);
        const sp = (hash2(x, y, seed + 5) - 0.5) * p.speckle;
        r = base[0] + sp;
        g = base[1] + sp;
        b = base[2] + sp * 0.7;
      }
      const o = (y * size + x) * 4;
      img.data[o] = clamp8(r);
      img.data[o + 1] = clamp8(g);
      img.data[o + 2] = clamp8(b);
      img.data[o + 3] = 255;
    }
  }
  return img;
}

/** 256x256 tileable mask: four independent noise channels (RGBA), contrast-stretched to the full range. */
export function generateNoise(seed: number): Rgba {
  const size = NOISE_SIZE;
  const img = createRgba(size, size);
  for (let ch = 0; ch < 4; ch++) {
    const vals = new Float64Array(size * size);
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const val = fbm(x / size, y / size, 4, 4, 5, seed + ch * 1013);
        vals[y * size + x] = val;
        if (val < lo) lo = val;
        if (val > hi) hi = val;
      }
    }
    const span = hi - lo || 1;
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4 + ch] = clamp8(((vals[i]! - lo) / span) * 255);
    }
  }
  return img;
}

/** Derive one sub-seed per asset from the single fixed asset seed (stable order). */
export function terrainSeeds(assetSeed: number): Record<GroundName | 'noise', number> {
  const prng = createPrng(assetSeed);
  const out = {} as Record<GroundName | 'noise', number>;
  for (const n of [...GROUND_NAMES, 'noise'] as const) out[n] = prng.nextU32() >>> 0;
  return out;
}
