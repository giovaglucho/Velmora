import { z } from 'zod';
import { Id, LocalizedName, Notes } from './common.js';
import { Modifier } from './modifiers.js';

const Bonus = z.object({
  id: Id,
  text: z.string(),
  modifiers: z.array(Modifier),
  /** Techs granted for free (e.g. Valdren yugo). */
  grantsTech: z.array(Id).optional(),
  /** Non-modifier rules (e.g. houses disabled). */
  rules: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  notes: Notes,
});

export const FactionDef = z
  .object({
    id: Id,
    name: LocalizedName,
    launch: z.boolean(),
    inspiration: z.string(),
    gameplayIdea: z.string(),
    aoe2Role: z.string(),
    architecture: z.string(),
    voiceLanguage: z.string(),
    music: z.string().optional(),
    bonuses: z.array(Bonus).length(4),
    teamBonus: Bonus,
    uniqueUnit: z.object({
      id: Id,
      name: LocalizedName,
      building: Id,
      description: z.string(),
      /** Numeric mechanics stated in the GDD. Base stats are not in the GDD: statsPending. */
      mechanics: z.record(z.string(), z.number()),
      statsPending: z.boolean(),
      eliteVersion: z.boolean(),
    }),
    uniqueTechs: z.object({ castle: Id, aether: Id }),
    disabledUnits: z.array(Id),
    disabledTechs: z.array(Id),
    notes: Notes,
  })
  .strict();
export type FactionDef = z.infer<typeof FactionDef>;
