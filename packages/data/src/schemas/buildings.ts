import { z } from 'zod';
import { Id, LocalizedName, Age, Cost, ResourceId, Notes } from './common.js';

const AgeMap = z.record(z.string().regex(/^[1-4]$/), z.number());

export const BuildingDef = z
  .object({
    id: Id,
    name: LocalizedName,
    age: Age,
    cost: Cost.optional(),
    buildTime: z.number().positive().optional(),
    /** HP by age (key = age). Ages not listed are unspecified in the GDD (see notes). */
    hp: AgeMap,
    armor: z.object({ melee: z.number().int(), pierce: z.number().int() }).optional(),
    /** Extra melee/pierce armor per age reached (GDD §5 "+1 por era"). 0 where the table shows no (+1). */
    armorPerAge: z.number().int().nonnegative(),
    size: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
    /** Vision by age (key = age) where the GDD gives it (Atalaya). */
    los: AgeMap.optional(),
    popProvided: z.number().int().optional(),
    garrison: z.number().int().optional(),
    dropsOff: z.array(ResourceId).optional(),
    requiresTech: Id.optional(),
    role: z.enum(['economy', 'military', 'defense', 'wall', 'support', 'wonder', 'naval']),
    /** GDD "Función" column (Spanish, verbatim). */
    function: z.string(),
    aoe2Equivalent: z.string().optional(),
    sprite: z.string(),
    notes: Notes,
  })
  .strict();
export type BuildingDef = z.infer<typeof BuildingDef>;
export const BuildingsFile = z.object({ buildings: z.array(BuildingDef).min(1) });
export type BuildingsFile = z.infer<typeof BuildingsFile>;
