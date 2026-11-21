// State hashing (ADR-005 §4): FNV-1a 32-bit over little-endian int32 values, fixed order.
import { FNV_OFFSET_BASIS, fnv1aInt32, hashBytes } from '@reinos/shared';
import { HASHED_COLUMNS } from './columns';
import { MAX_WAYPOINTS, makeEid, type World } from './world';

/** What hashStateFull needs from the grid (the sim passes its Grid). */
export interface GridHashView {
  readonly version: number;
  readonly terrain: Uint8Array;
  readonly occ: Uint8Array;
}

type Column = Int32Array | Uint16Array | Uint8Array;

/** O(entities) hash of the gameplay-relevant state. Called once per turn. */
export function hashState(
  w: World,
  tick: number,
  gridVersion: number,
  prng: readonly [number, number, number, number],
): number {
  let h = FNV_OFFSET_BASIS;
  h = fnv1aInt32(h, tick);
  h = fnv1aInt32(h, w.count);
  h = fnv1aInt32(h, gridVersion);
  h = fnv1aInt32(h, prng[0]);
  h = fnv1aInt32(h, prng[1]);
  h = fnv1aInt32(h, prng[2]);
  h = fnv1aInt32(h, prng[3]);
  const n = HASHED_COLUMNS.length;
  const cols: Column[] = new Array<Column>(n);
  for (let k = 0; k < n; k++) cols[k] = w[HASHED_COLUMNS[k] as keyof World] as Column;
  for (let i = 0; i < w.highWater; i++) {
    if (w.alive[i] === 0) continue;
    h = fnv1aInt32(h, makeEid(w.gen[i] as number, i));
    for (let k = 0; k < n; k++) h = fnv1aInt32(h, (cols[k] as Column)[i] as number);
  }
  return h >>> 0;
}

/**
 * hashState plus the data that is not hashed per turn: path length, remaining waypoints,
 * repathAt per entity, and the grid layers. Used by test:det and desync dumps.
 */
export function hashStateFull(
  w: World,
  tick: number,
  grid: GridHashView,
  prng: readonly [number, number, number, number],
): number {
  let h = hashState(w, tick, grid.version, prng);
  for (let i = 0; i < w.highWater; i++) {
    if (w.alive[i] === 0) continue;
    const count = w.pathCount[i] as number;
    h = fnv1aInt32(h, count);
    const base = i * MAX_WAYPOINTS;
    for (let k = w.pathIdx[i] as number; k < count; k++) {
      h = fnv1aInt32(h, w.wpX[base + k] as number);
      h = fnv1aInt32(h, w.wpY[base + k] as number);
    }
    h = fnv1aInt32(h, w.repathAt[i] as number);
  }
  h = fnv1aInt32(h, hashBytes(grid.terrain));
  h = fnv1aInt32(h, hashBytes(grid.occ));
  return h >>> 0;
}
