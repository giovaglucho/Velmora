// Provisional terrain textures generated in memory (PURE, deterministic, no Pixi). Owner: render-engineer (R2).
// Stand-in until art-pipeline (A1) ships ground0..3.png / noise.png; the Pixi side takes either through
// `TerrainTextures` (see textures.ts). Periodic (toroidal) value noise → tileable by construction.
import { createPrng } from '@reinos/shared';

export const PROC_GROUND_SIZE = 512;
export const PROC_NOISE_SIZE = 256;

/** Base colours (r,g,b) of the 4 layers: grass, dirt, sand, rock/ash. Presentation only. */
const BASE: ReadonlyArray<readonly [number, number, number]> = [
  [74, 122, 52],
  [128, 94, 62],
  [196, 176, 120],
  [104, 100, 98],
];

function periodicNoise(
  rand: () => number,
  size: number,
  cells: number,
): (x: number, y: number) => number {
  const lat = new Float64Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const cs = size / cells;
  return (x, y) => {
    const fx = x / cs;
    const fy = y / cs;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const i0 = ix % cells;
    const i1 = (ix + 1) % cells;
    const j0 = iy % cells;
    const j1 = (iy + 1) % cells;
    const a = lat[j0 * cells + i0]! + (lat[j0 * cells + i1]! - lat[j0 * cells + i0]!) * sx;
    const b = lat[j1 * cells + i0]! + (lat[j1 * cells + i1]! - lat[j1 * cells + i0]!) * sx;
    return a + (b - a) * sy;
  };
}

/** Tileable RGBA8 ground texture for layer `layer` (0..3), `size`² px. */
export function generateGround(layer: number, size = PROC_GROUND_SIZE): Uint8Array {
  const rng = createPrng((0x9e3779b1 + layer * 0x85ebca6b) >>> 0);
  const rand = () => rng.nextU32() / 4294967296;
  const n1 = periodicNoise(rand, size, 4);
  const n2 = periodicNoise(rand, size, 8);
  const n3 = periodicNoise(rand, size, 16);
  const n4 = periodicNoise(rand, size, 64);
  const base = BASE[layer & 3]!;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const f = n1(x, y) * 0.4 + n2(x, y) * 0.3 + n3(x, y) * 0.2 + n4(x, y) * 0.1;
      const shade = 0.62 + f * 0.76; // ≈ 0.62..1.38 around the base colour
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++)
        out[o + c] = Math.max(0, Math.min(255, Math.round(base[c]! * shade)));
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Tileable RGBA8 mask: 4 independent noise channels (R,G,B,A). */
export function generateNoise(size = PROC_NOISE_SIZE): Uint8Array {
  const rng = createPrng(0x51ed270b);
  const rand = () => rng.nextU32() / 4294967296;
  const out = new Uint8Array(size * size * 4);
  for (let c = 0; c < 4; c++) {
    const a = periodicNoise(rand, size, 8);
    const b = periodicNoise(rand, size, 32);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        out[(y * size + x) * 4 + c] = Math.max(
          0,
          Math.min(255, Math.round((a(x, y) * 0.65 + b(x, y) * 0.35) * 255)),
        );
  }
  return out;
}
