// ADR-006 §4.6 — client-side (non-authoritative) terrain data. PURE. Owner: render-engineer (R2).
// Presentation only: it never feeds the sim nor the hash. F3 will replace the generator with real MapSpec kinds.
import { createPrng } from '@reinos/shared';

// grass, dirt, sand, rock/ash (walkable ground) + water, forest (sim-blocked obstacles). Natural rock is walkable and
// must never look like an obstacle, so blocked tiles use their own layers.
export type TerrainKind = 0 | 1 | 2 | 3 | 4 | 5;
export const TERRAIN_LAYERS = 6;
/** Walkable rock/ash patch (NOT an obstacle). */
export const KIND_ROCK: TerrainKind = 3;
export const KIND_WATER: TerrainKind = 4;
export const KIND_FOREST: TerrainKind = 5;
/** Obstacle classes as published by the scenario (worker/scenarios.ts OBSTACLE_*; kept equal by a test). */
export const OBSTACLE_LAKE = 1;
export const OBSTACLE_FOREST = 2;

export interface TerrainMap {
  readonly width: number;
  readonly height: number;
  /** length W*H, row-major (y * W + x) */
  readonly kind: Uint8Array;
  /** (W+1)*(H+1)*4 RGBA8: per-vertex layer weights (R,G,B,A = layers 0..3). */
  readonly splat: Uint8Array;
  /** (W+1)*(H+1)*4 RGBA8: per-vertex weights of the obstacle layers (R = water, G = forest, B/A = 0). */
  readonly splat2: Uint8Array;
}

/** Expands alternating run lengths (starting with FREE) into a 0/1 mask of length W*H. */
export function decodeBlockedRle(blockedRle: readonly number[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let pos = 0;
  let blocked = 0;
  for (const run of blockedRle) {
    if (blocked === 1) out.fill(1, pos, Math.min(size, pos + run));
    pos += run;
    blocked ^= 1;
    if (pos >= size) break;
  }
  return out;
}

/** Smoothly interpolated value noise on a coarse lattice (cell = `cell` tiles), range [0,1). */
function makeValueNoise(rand: () => number, w: number, h: number, cell: number) {
  const lw = Math.ceil(w / cell) + 2;
  const lh = Math.ceil(h / cell) + 2;
  const lat = new Float64Array(lw * lh);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  return (x: number, y: number): number => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (i: number, j: number) => lat[j * lw + i] ?? 0;
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Per-vertex share (0..255) of each of the 6 layers among the (up to 4) tiles around the vertex. */
function vertexShares(kind: Uint8Array, width: number, height: number): Uint8Array {
  const vw = width + 1;
  const vh = height + 1;
  const out = new Uint8Array(vw * vh * TERRAIN_LAYERS);
  const counts = new Array<number>(TERRAIN_LAYERS).fill(0);
  for (let j = 0; j < vh; j++) {
    for (let i = 0; i < vw; i++) {
      counts.fill(0);
      let n = 0;
      for (let dj = -1; dj <= 0; dj++) {
        for (let di = -1; di <= 0; di++) {
          const x = i + di;
          const y = j + dj;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const k = Math.min(TERRAIN_LAYERS - 1, kind[y * width + x] ?? 0);
          counts[k] = (counts[k] ?? 0) + 1;
          n++;
        }
      }
      const o = (j * vw + i) * TERRAIN_LAYERS;
      for (let k = 0; k < TERRAIN_LAYERS; k++)
        out[o + k] = Math.round(((counts[k] ?? 0) * 255) / n);
    }
  }
  return out;
}

function packShares(shares: Uint8Array, from: number, count: number): Uint8Array {
  const verts = shares.length / TERRAIN_LAYERS;
  const out = new Uint8Array(verts * 4);
  for (let v = 0; v < verts; v++)
    for (let c = 0; c < count; c++) out[v * 4 + c] = shares[v * TERRAIN_LAYERS + from + c] ?? 0;
  return out;
}

/** Per-vertex weights of the walkable layers 0..3 (RGBA). Together with `buildSplatWeights2` they sum to ≈255. */
export function buildSplatWeights(kind: Uint8Array, width: number, height: number): Uint8Array {
  return packShares(vertexShares(kind, width, height), 0, 4);
}
/** Per-vertex weights of the obstacle layers (R = water, G = forest). */
export function buildSplatWeights2(kind: Uint8Array, width: number, height: number): Uint8Array {
  return packShares(vertexShares(kind, width, height), 4, 2);
}

export function buildTerrainMap(
  width: number,
  height: number,
  blockedRle: readonly number[],
  seed: number,
  /** Client-side obstacle classes (OBSTACLE_LAKE / OBSTACLE_FOREST per tile); blocked tiles without a class are forest. */
  obstacles?: Uint8Array,
): TerrainMap {
  const rng = createPrng((seed ^ 0x7e44a1) >>> 0);
  const rand = () => rng.nextU32() / 4294967296;
  const big = makeValueNoise(rand, width, height, 20);
  const mid = makeValueNoise(rand, width, height, 9);
  const kindSel = makeValueNoise(rand, width, height, 14);
  const blocked = decodeBlockedRle(blockedRle, width * height);
  const kind = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (blocked[i]) {
        kind[i] = obstacles?.[i] === OBSTACLE_LAKE ? KIND_WATER : KIND_FOREST;
        continue;
      }
      const v = big(x, y) * 0.65 + mid(x, y) * 0.35;
      let k: TerrainKind = 0;
      if (v > 0.62)
        k = kindSel(x, y) > 0.5 ? 2 : 1; // patches of sand / dirt
      else if (v < 0.3) k = 1;
      if (v > 0.78) k = KIND_ROCK;
      kind[i] = k;
    }
  }
  return {
    width,
    height,
    kind,
    splat: buildSplatWeights(kind, width, height),
    splat2: buildSplatWeights2(kind, width, height),
  };
}

/** Control for the seam metric (Q3): one-hot weights per TILE (hard borders at integer grid lines). */
export function buildHardSplat(
  kind: Uint8Array,
  width: number,
  height: number,
): { splat: Uint8Array; splat2: Uint8Array } {
  const vw = width + 1;
  const splat = new Uint8Array(vw * (height + 1) * 4);
  const splat2 = new Uint8Array(vw * (height + 1) * 4);
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const k = kind[j * width + i] ?? 0;
      if (k < 4) splat[(j * vw + i) * 4 + k] = 255;
      else splat2[(j * vw + i) * 4 + (k - 4)] = 255;
    }
  return { splat, splat2 };
}
