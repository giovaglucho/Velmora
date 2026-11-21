import { z } from 'zod';
import { Id, LocalizedName, Age, Cost, Notes } from './common.js';

const Requirement = z.object({ count: z.number().int().positive(), buildings: z.array(Id).min(1) });

export const AgeDef = z
  .object({
    id: Id,
    age: Age,
    name: LocalizedName,
    equivalent: z.string(),
    narrative: z.string(),
    cost: Cost,
    researchTime: z.number().nonnegative(),
    /** Any one of the requirements must be satisfied. */
    requirements: z.array(Requirement),
    /** Buildings that do NOT count toward requirements. */
    excludedBuildings: z.array(Id),
    notes: Notes,
  })
  .strict();

export const AgesFile = z.object({
  ages: z.array(AgeDef).length(4),
  implicit: z.object({
    /** §5: +1/+1 armor per age to buildings (except exempt). */
    buildingArmorPerAge: z.number().int(),
    armorExemptBuildings: z.array(Id),
    /** §5: HP per age (key = building id) -> [age I, II, III, IV]. */
    buildingHpByAge: z.record(Id, z.array(z.number().int()).length(4)),
    scoutLosPerAge: z.number().int(),
    scoutUnitLine: Id,
    hiddenUnitUpgrades: z.array(z.object({ unit: Id, stats: z.record(z.string(), z.number()) })),
    ciudadelaBlocksSettlersWhileResearching: z.boolean(),
    notes: Notes,
  }),
});
export type AgesFile = z.infer<typeof AgesFile>;
