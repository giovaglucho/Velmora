// Integer-only data bridge between @reinos/data (which builds it) and the sim (ADR-005 §6).
import type { Fx } from './fixed';
import { FNV_OFFSET_BASIS, fnv1aInt32 } from './hash';

/** Tuning for movement; lives in packages/data/json/game.json, block "movement". */
export interface MovementTuning {
  /** Path requests resolved per tick. */
  pathBudgetPerTick: number;
  /** Exact arrival distance to the goal. */
  arriveDistFx: Fx;
  /** "Good enough" arrival distance once stuck >= stuckTicks. */
  groupArriveDistFx: Fx;
  /** Ticks without progress before declaring a jam. */
  stuckTicks: number;
  /** Minimum ticks between re-paths of one unit. */
  repathCooldownTicks: number;
  /** Separation weight, 1000 = 1.0. */
  separationPermille: number;
  /** Neighbour query radius (sum of radii + margin). */
  neighborRangeFx: Fx;
  /** Stuck detection: a tick counts as "no progress" below this permille of the unit speed. */
  minProgressPermille: number;
}

export interface SimData {
  /** DATA_VERSION the object was built from. */
  dataVersion: string;
  /** typeId = position in units.json (file order). */
  unitIds: readonly string[];
  /** round(speed * fixedScale / TICKS_PER_SECOND). */
  speedFxPerTick: readonly number[];
  /** Max over the unit's classes of movement.radiusFxByClass (or defaultRadiusFx). */
  radiusFx: readonly number[];
  /** hp * fixedScale. */
  hpFx: readonly number[];
  movement: MovementTuning;
}

/** Domain tag mixed into simDataHash; bump if the hashed layout below changes. */
const SIM_DATA_HASH_LAYOUT = 1;

function hashNum(h: number, v: number, what: string): number {
  if (!Number.isSafeInteger(v))
    throw new RangeError('simDataHash: ' + what + ' must be an integer');
  // Two 32-bit halves (low word via ToUint32, high word exact for safe integers): injective.
  return fnv1aInt32(fnv1aInt32(h, v >>> 0), Math.floor(v / 0x100000000));
}
function hashStr(h: number, s: string): number {
  let x = fnv1aInt32(h, s.length);
  for (let i = 0; i < s.length; i++) x = fnv1aInt32(x, s.charCodeAt(i));
  return x;
}
function hashArr(h: number, a: readonly number[], what: string): number {
  let x = fnv1aInt32(h, a.length);
  for (let i = 0; i < a.length; i++) x = hashNum(x, a[i] as number, what + '[' + i + ']');
  return x;
}

/**
 * Deterministic FNV-1a (uint32) digest of the full content of a SimData, in a fixed field order
 * (layout tag, dataVersion, unitIds, speedFxPerTick, radiusFx, hpFx, movement fields in
 * declaration order). Pure integer code; throws RangeError on a non-integer value. Two peers
 * simulate identically only if they agree on this value (R1/F1 H3).
 */
export function simDataHash(d: SimData): number {
  let h = fnv1aInt32(FNV_OFFSET_BASIS, SIM_DATA_HASH_LAYOUT);
  h = hashStr(h, d.dataVersion);
  h = fnv1aInt32(h, d.unitIds.length);
  for (let i = 0; i < d.unitIds.length; i++) h = hashStr(h, d.unitIds[i] as string);
  h = hashArr(h, d.speedFxPerTick, 'speedFxPerTick');
  h = hashArr(h, d.radiusFx, 'radiusFx');
  h = hashArr(h, d.hpFx, 'hpFx');
  const m = d.movement;
  h = hashNum(h, m.pathBudgetPerTick, 'movement.pathBudgetPerTick');
  h = hashNum(h, m.arriveDistFx, 'movement.arriveDistFx');
  h = hashNum(h, m.groupArriveDistFx, 'movement.groupArriveDistFx');
  h = hashNum(h, m.stuckTicks, 'movement.stuckTicks');
  h = hashNum(h, m.repathCooldownTicks, 'movement.repathCooldownTicks');
  h = hashNum(h, m.separationPermille, 'movement.separationPermille');
  h = hashNum(h, m.neighborRangeFx, 'movement.neighborRangeFx');
  h = hashNum(h, m.minProgressPermille, 'movement.minProgressPermille');
  return h >>> 0;
}
