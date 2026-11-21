import { z } from 'zod';
import { Id, LocalizedName, Age, Cost, Notes } from './common.js';
import { Modifier } from './modifiers.js';

export const TechDef = z
  .object({
    id: Id,
    name: LocalizedName,
    age: Age,
    building: Id,
    cost: Cost.optional(),
    researchTime: z.number().positive().optional(),
    effects: z.array(Modifier),
    /** Effect described in GDD prose only; see notes. */
    effectText: z.string().optional(),
    faction: Id.optional(),
    category: z.enum([
      'economy',
      'forge',
      'military',
      'academy',
      'fortification',
      'sanctuary',
      'unique',
    ]),
    requires: z.array(Id).optional(),
    notes: Notes,
  })
  .strict();
export type TechDef = z.infer<typeof TechDef>;
export const TechsFile = z.object({ techs: z.array(TechDef).min(1) });
export type TechsFile = z.infer<typeof TechsFile>;
