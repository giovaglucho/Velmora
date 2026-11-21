import { z } from 'zod';
import { Id, LocalizedName, Age, Cost, Notes } from './common.js';

/** Line upgrade (GDD §7.2): unit -> unit, or building -> stronger building variant (§6 "Mejoras de defensas"). */
export const UpgradeDef = z
  .object({
    id: Id,
    name: LocalizedName.optional(),
    kind: z.enum(['unit', 'building']),
    from: Id,
    to: Id.optional(),
    building: Id.optional(),
    age: Age.optional(),
    cost: Cost.optional(),
    researchTime: z.number().positive().optional(),
    /** For kind=building: stats of the upgraded variant (no separate building entry). */
    result: z
      .object({
        hp: z.number().int().optional(),
        armor: z.object({ melee: z.number().int(), pierce: z.number().int() }).optional(),
      })
      .optional(),
    notes: Notes,
  })
  .strict();
export type UpgradeDef = z.infer<typeof UpgradeDef>;
export const UpgradesFile = z.object({ upgrades: z.array(UpgradeDef) });
export type UpgradesFile = z.infer<typeof UpgradesFile>;
