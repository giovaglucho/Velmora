// Spatial hash over tiles (ADR-005 §10). Counting sort from prevX/prevY in ascending slot
// order, so neighbours inside a tile are ascending by slot. Only touched cells are reset.
import { fxToTile } from '@reinos/shared';
import type { World } from '../ecs/index';
import type { Grid } from '../systems';

export interface SpatialHash {
  /** Slots sorted by tile; query() exposes [start, end) on it. */
  readonly slots: Int32Array;
  start: number;
  end: number;
  rebuild(w: World): void;
  /** Sets start/end for tile (tx, ty); empty (start === end) when outside the map. */
  query(tx: number, ty: number): void;
}

export function createSpatialHash(grid: Grid, capacity: number): SpatialHash {
  const { width, height } = grid;
  const cells = width * height;
  const count = new Uint16Array(cells);
  const offset = new Int32Array(cells);
  const fill = new Uint16Array(cells);
  const touched = new Int32Array(capacity);
  const cellOf = new Int32Array(capacity);
  const slots = new Int32Array(capacity);
  let nTouched = 0;

  const sh: SpatialHash = {
    slots,
    start: 0,
    end: 0,
    rebuild(w) {
      for (let k = 0; k < nTouched; k++) {
        const c = touched[k] as number;
        count[c] = 0;
        fill[c] = 0;
      }
      nTouched = 0;
      for (let i = 0; i < w.highWater; i++) {
        if (w.alive[i] === 0) continue;
        let tx = fxToTile(w.prevX[i] as number);
        let ty = fxToTile(w.prevY[i] as number);
        if (tx >= width) tx = width - 1;
        if (ty >= height) ty = height - 1;
        const c = ty * width + tx;
        cellOf[i] = c;
        if (count[c] === 0) touched[nTouched++] = c;
        count[c] = (count[c] as number) + 1;
      }
      let run = 0;
      for (let k = 0; k < nTouched; k++) {
        const c = touched[k] as number;
        offset[c] = run;
        run += count[c] as number;
      }
      for (let i = 0; i < w.highWater; i++) {
        if (w.alive[i] === 0) continue;
        const c = cellOf[i] as number;
        slots[(offset[c] as number) + (fill[c] as number)] = i;
        fill[c] = (fill[c] as number) + 1;
      }
    },
    query(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) {
        sh.start = 0;
        sh.end = 0;
        return;
      }
      const c = ty * width + tx;
      const n = count[c] as number;
      sh.start = n === 0 ? 0 : (offset[c] as number);
      sh.end = sh.start + n;
    },
  };
  return sh;
}
