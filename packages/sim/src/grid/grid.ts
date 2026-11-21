// Tile grid (ADR-005 §10): terrain + building occupancy layers, version counter, dirty-sector
// tracking for the sector graph, nearestFree. Units never block the grid.
import type { Grid } from '../systems';

export const SECTOR_SIZE = 16;
export const SECTOR_SHIFT = 4;

/** Called by flush() with the dirty sectors in ascending order (list[0..count)). */
export type FlushListener = (sectors: Int32Array, count: number) => void;

/** The real grid: a `Grid` plus the dirty-sector bookkeeping the path module consumes. */
export interface GridImpl extends Grid {
  /** 1 for sectors whose walkability changed since the last flush(). */
  readonly dirty: Uint8Array;
  addFlushListener(l: FlushListener): void;
  /** True if any sector is waiting for flush(). */
  hasPendingFlush(): boolean;
  /** Marks every sector dirty (used by loadMap; does not touch `version`). */
  markAllDirty(): void;
}

export function createGrid(width: number, height: number): GridImpl {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new RangeError('grid size must be positive integers');
  const sectorsX = (width + SECTOR_SIZE - 1) >> SECTOR_SHIFT;
  const sectorsY = (height + SECTOR_SIZE - 1) >> SECTOR_SHIFT;
  const nSectors = sectorsX * sectorsY;
  const terrain = new Uint8Array(width * height);
  const occ = new Uint8Array(width * height);
  const dirty = new Uint8Array(nSectors);
  const list = new Int32Array(nSectors);
  const listeners: FlushListener[] = [];
  let dirtyCount = 0;

  const markDirty = (tx: number, ty: number): void => {
    const s = (ty >> SECTOR_SHIFT) * sectorsX + (tx >> SECTOR_SHIFT);
    if (dirty[s] === 0) {
      dirty[s] = 1;
      dirtyCount++;
    }
  };
  const inside = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < width && ty < height;

  const grid: GridImpl = {
    width,
    height,
    sectorsX,
    sectorsY,
    terrain,
    occ,
    version: 0,
    dirty,
    isBlocked(tx, ty) {
      if (!inside(tx, ty)) return true;
      const i = ty * width + tx;
      return ((terrain[i] as number) | (occ[i] as number)) !== 0;
    },
    setTerrain(tx, ty, blocked) {
      if (!inside(tx, ty)) return;
      const i = ty * width + tx;
      const v = blocked ? 1 : 0;
      if (terrain[i] === v) return;
      const wasBlocked = occ[i] !== 0 || terrain[i] !== 0;
      terrain[i] = v;
      grid.version++;
      if (wasBlocked !== (occ[i] !== 0 || v !== 0)) markDirty(tx, ty);
    },
    occupyRect(tx, ty, w, h) {
      for (let y = ty; y < ty + h; y++)
        for (let x = tx; x < tx + w; x++) {
          if (!inside(x, y)) continue;
          const i = y * width + x;
          const wasFree = terrain[i] === 0 && occ[i] === 0;
          occ[i] = (occ[i] as number) + 1;
          if (wasFree) markDirty(x, y);
        }
      grid.version++;
    },
    releaseRect(tx, ty, w, h) {
      for (let y = ty; y < ty + h; y++)
        for (let x = tx; x < tx + w; x++) {
          if (!inside(x, y)) continue;
          const i = y * width + x;
          if ((occ[i] as number) === 0) continue;
          occ[i] = (occ[i] as number) - 1;
          if (terrain[i] === 0 && occ[i] === 0) markDirty(x, y);
        }
      grid.version++;
    },
    sectorOf(tx, ty) {
      return (ty >> SECTOR_SHIFT) * sectorsX + (tx >> SECTOR_SHIFT);
    },
    nearestFree(tx, ty, out) {
      const maxR = Math.max(width, height);
      for (let r = 0; r <= maxR; r++) {
        const y0 = Math.max(ty - r, 0);
        const y1 = Math.min(ty + r, height - 1);
        for (let y = y0; y <= y1; y++) {
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
    flush() {
      if (dirtyCount === 0) return;
      let n = 0;
      for (let s = 0; s < nSectors; s++) {
        if (dirty[s] === 1) {
          list[n++] = s;
          dirty[s] = 0;
        }
      }
      dirtyCount = 0;
      for (let k = 0; k < listeners.length; k++) (listeners[k] as FlushListener)(list, n);
    },
    addFlushListener(l) {
      listeners.push(l);
    },
    hasPendingFlush() {
      return dirtyCount > 0;
    },
    markAllDirty() {
      dirty.fill(1);
      dirtyCount = nSectors;
    },
  };
  return grid;
}
