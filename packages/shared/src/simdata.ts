// Integer-only data bridge between @reinos/data (which builds it) and the sim (ADR-005 §6).
import type { Fx } from './fixed';

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
