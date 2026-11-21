// Minimal tile grid used until the C1 task provides grid/ (ADR-005 §10). Semantics follow the
// ADR: terrain and building footprints are separate layers, units never block, nearestFree
// scans Chebyshev rings with row-major order inside each ring.
import type { MapSpec } from '@reinos/shared';
import type { Grid } from '../systems';

const SECTOR = 16;

export function createStubGrid(width: number, height: number): Grid {
  const sectorsX = Math.trunc((width + SECTOR - 1) / SECTOR);
  const sectorsY = Math.trunc((height + SECTOR - 1) / SECTOR);
  const terrain = new Uint8Array(width * height);
  const occ = new Uint8Array(width * height);
  const inside = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < width && ty < height;

  const grid: Grid = {
    width,
    height,
    sectorsX,
    sectorsY,
    terrain,
    occ,
    version: 0,
    isBlocked(tx, ty) {
      if (!inside(tx, ty)) return true;
      const i = ty * width + tx;
      return (terrain[i] as number) !== 0 || (occ[i] as number) !== 0;
    },
    setTerrain(tx, ty, blocked) {
      if (!inside(tx, ty)) return;
      const i = ty * width + tx;
      const v = blocked ? 1 : 0;
      if (terrain[i] === v) return;
      terrain[i] = v;
      grid.version++;
    },
    occupyRect(tx, ty, w, h) {
      for (let y = ty; y < ty + h; y++)
        for (let x = tx; x < tx + w; x++)
          if (inside(x, y)) occ[y * width + x] = (occ[y * width + x] as number) + 1;
      grid.version++;
    },
    releaseRect(tx, ty, w, h) {
      for (let y = ty; y < ty + h; y++)
        for (let x = tx; x < tx + w; x++)
          if (inside(x, y) && (occ[y * width + x] as number) > 0)
            occ[y * width + x] = (occ[y * width + x] as number) - 1;
      grid.version++;
    },
    sectorOf(tx, ty) {
      return Math.trunc(ty / SECTOR) * sectorsX + Math.trunc(tx / SECTOR);
    },
    nearestFree(tx, ty, out) {
      const maxR = Math.max(width, height);
      for (let r = 0; r <= maxR; r++) {
        for (let y = ty - r; y <= ty + r; y++) {
          if (y < 0 || y >= height) continue;
          const edge = y === ty - r || y === ty + r;
          const step = edge || r === 0 ? 1 : 2 * r;
          for (let x = tx - r; x <= tx + r; x += step) {
            if (x >= 0 && x < width && !grid.isBlocked(x, y)) {
              out.tx = x;
              out.ty = y;
              return true;
            }
          }
        }
      }
      return false;
    },
    flush() {},
  };
  return grid;
}

/** Decodes blockedRle (alternating runs starting with FREE) into the terrain layer. loadMap is the baseline: it does not bump `version`. */
export function createStubGridFromMap(map: MapSpec): Grid {
  const grid = createStubGrid(map.width, map.height);
  let pos = 0;
  let blocked = 0;
  for (let i = 0; i < map.blockedRle.length; i++) {
    const run = map.blockedRle[i] as number;
    if (blocked === 1) grid.terrain.fill(1, pos, pos + run);
    pos += run;
    blocked ^= 1;
  }
  return grid;
}
