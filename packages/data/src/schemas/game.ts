import { z } from 'zod';
import { Id, LocalizedName, ArmorClass, Notes, UnitClass } from './common.js';

const PositiveInt = z.number().int().positive();

/**
 * Movement tuning (ADR-005 §6). Integers only; distances in fixed point (1/1000 tile).
 * `radiusFxByClass` and `defaultRadiusFx` are consumed only by buildSimData.
 */
export const MovementTuningFile = z
  .object({
    pathBudgetPerTick: PositiveInt,
    arriveDistFx: PositiveInt,
    groupArriveDistFx: PositiveInt,
    stuckTicks: PositiveInt,
    repathCooldownTicks: z.number().int().nonnegative(),
    separationPermille: z.number().int().min(0).max(4000),
    neighborRangeFx: PositiveInt,
    minProgressPermille: z.number().int().min(1).max(1000),
    defaultRadiusFx: PositiveInt,
    radiusFxByClass: z.partialRecord(UnitClass, PositiveInt),
  })
  .strict()
  .refine((m) => m.arriveDistFx <= m.groupArriveDistFx, {
    message: 'arriveDistFx must be <= groupArriveDistFx',
  });
export type MovementTuningFile = z.infer<typeof MovementTuningFile>;

/** Global parameters (§3.5), terrain (§11.3), map pool (§11.2), movement tuning (ADR-005). */
export const GameFile = z.object({
  mapSizes: z.array(
    z.object({
      id: Id,
      name: LocalizedName,
      side: z.number().int(),
      players: z.number().int(),
      launch: z.boolean(),
    }),
  ),
  population: z.object({
    default: z.number().int(),
    max: z.number().int(),
    futureMax: z.number().int(),
  }),
  gameSpeeds: z.array(z.number()),
  standardGameSpeed: z.number(),
  terrain: z.array(
    z.object({
      id: Id,
      name: LocalizedName,
      speedPct: z.number().optional(),
      passable: z.string(),
      notes: Notes,
    }),
  ),
  elevation: z.object({
    maxLevel: z.number().int(),
    attackerHigherMul: z.number(),
    attackerLowerMul: z.number(),
    climbSlowPct: z.number(),
  }),
  mapPool: z.array(
    z.object({
      id: Id,
      name: LocalizedName,
      inspiration: z.string(),
      trait: z.string(),
      release: z.enum(['1.0', '1.1']),
      scriptAvailable: z.boolean(),
    }),
  ),
  movement: MovementTuningFile,
});
export type GameFile = z.infer<typeof GameFile>;

/** Combat constants (§6 repair/build, §8). */
export const CombatFile = z.object({
  fixedScale: z.literal(1000),
  armorClasses: z.array(ArmorClass),
  minDamage: z.number().int(),
  elevation: z.object({ higher: z.number(), lower: z.number() }),
  nonClassArmor: z.number().int(),
  areaDamage: z.array(
    z.object({
      id: Id,
      unit: Id,
      radius: z.number(),
      alliedDamage: z.boolean().optional(),
      buildingsOnly: z.boolean().optional(),
      unitPending: z.boolean().optional(),
      notes: Notes,
    }),
  ),
  garrison: z.object({
    healPerSecondTower: z.number(),
    healPerSecondBastion: z.number(),
    ejectBelowHpPct: z.number(),
    settlerArrowDps: z.number(),
    ramCapacity: z.number().int(),
    villageBellRadius: z.number(),
    notes: Notes,
  }),
  custodian: z.object({
    healAmount: z.number(),
    healIntervalSeconds: z.number(),
    faithRechargePerSecond: z.number(),
    resonance: z.object({
      minSeconds: z.number(),
      maxSeconds: z.number(),
      successPct: z.number(),
      rollIntervalSeconds: z.number(),
      buildingMinSeconds: z.number(),
      buildingMaxSeconds: z.number(),
      buildingSuccessPct: z.number(),
      lightCavalrySuccessPct: z.number(),
      notes: Notes,
    }),
  }),
  construction: z.object({
    multiBuilderNumerator: z.number(),
    multiBuilderOffset: z.number(),
    repairFirstPerMinute: z.number(),
    repairExtraPerMinute: z.number(),
    siegeShipRepairPct: z.number(),
    repairCostPct: z.number(),
  }),
  counters: z.array(
    z.object({ unit: z.string(), strongAgainst: z.string(), weakAgainst: z.string() }),
  ),
  stances: z.array(z.string()),
  formations: z.array(z.string()),
});
export type CombatFile = z.infer<typeof CombatFile>;
