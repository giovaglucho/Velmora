import { z } from 'zod';
import { Id, LocalizedName, Age, Cost, UnitClass, DamageMap, Notes } from './common.js';

/** GDD §18.1 unit format. Speeds/ranges/reload in GDD units (tiles, tiles/s, seconds). */
export const UnitDef = z
  .object({
    id: Id,
    name: LocalizedName,
    building: Id,
    age: Age,
    line: Id,
    cost: Cost,
    trainTime: z.number().positive(),
    hp: z.number().int().positive(),
    speed: z.number().positive(),
    los: z.number().int().positive(),
    reload: z.number().positive().optional(),
    range: z.number().positive().optional(),
    /** Projectile accuracy, integer percent (GDD "Prec."). */
    accuracy: z.number().int().min(1).max(100).optional(),
    attacks: DamageMap,
    armors: DamageMap,
    classes: z.array(UnitClass).min(1),
    upgradesTo: Id.optional(),
    sprite: z.string(),
    voice: z.string(),
    notes: Notes,
  })
  .strict();
export type UnitDef = z.infer<typeof UnitDef>;
export const UnitsFile = z.object({ units: z.array(UnitDef).min(1) });
export type UnitsFile = z.infer<typeof UnitsFile>;
