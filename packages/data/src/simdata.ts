import { DATA_VERSION } from './data.js';
import type { GameData } from './validate.js';

/**
 * Structural twin of `SimData` in @reinos/shared (data cannot import shared; contracts.md).
 * A test asserts it is assignable to the shared type.
 */
export interface BuiltSimData {
  dataVersion: string;
  unitIds: readonly string[];
  speedFxPerTick: readonly number[];
  radiusFx: readonly number[];
  hpFx: readonly number[];
  movement: {
    pathBudgetPerTick: number;
    arriveDistFx: number;
    groupArriveDistFx: number;
    stuckTicks: number;
    repathCooldownTicks: number;
    separationPermille: number;
    neighborRangeFx: number;
    minProgressPermille: number;
  };
}

/** Simulation tick rate (ADR-003). Test-checked against shared TICKS_PER_SECOND. */
const TICKS_PER_SECOND = 20;

/**
 * Round half up for finite x >= 0, with explicit tie semantics: floor(x) plus one when the exact
 * fractional part is >= 0.5. `x - floor(x)` is exact in IEEE-754 doubles, so ties (x.5) resolve
 * the same way in every engine without relying on Math.round (R1/F1 H4). Equal to Math.round on
 * non-negative inputs; the test suite checks that.
 */
export function roundHalfUp(x: number): number {
  if (!Number.isFinite(x) || x < 0) throw new RangeError('roundHalfUp: x must be finite and >= 0');
  const f = Math.floor(x);
  return x - f >= 0.5 ? f + 1 : f;
}

/**
 * Converts the float-based balance data into the integer-only object the sim consumes
 * (ADR-005 §6). Floats (units.json `speed` in tiles/s) are converted ONLY here, at load time.
 * typeId = position of the unit in units.json.
 */
export function buildSimData(data: GameData): BuiltSimData {
  const scale = data.economy.fixedScale;
  const mv = data.game.movement;
  const unitIds: string[] = [];
  const speedFxPerTick: number[] = [];
  const radiusFx: number[] = [];
  const hpFx: number[] = [];
  for (const u of data.units) {
    unitIds.push(u.id);
    speedFxPerTick.push(roundHalfUp((u.speed * scale) / TICKS_PER_SECOND));
    let r = 0;
    for (const c of u.classes) r = Math.max(r, mv.radiusFxByClass[c] ?? mv.defaultRadiusFx);
    radiusFx.push(r);
    hpFx.push(u.hp * scale);
  }
  return {
    dataVersion: DATA_VERSION,
    unitIds,
    speedFxPerTick,
    radiusFx,
    hpFx,
    movement: {
      pathBudgetPerTick: mv.pathBudgetPerTick,
      arriveDistFx: mv.arriveDistFx,
      groupArriveDistFx: mv.groupArriveDistFx,
      stuckTicks: mv.stuckTicks,
      repathCooldownTicks: mv.repathCooldownTicks,
      separationPermille: mv.separationPermille,
      neighborRangeFx: mv.neighborRangeFx,
      minProgressPermille: mv.minProgressPermille,
    },
  };
}
