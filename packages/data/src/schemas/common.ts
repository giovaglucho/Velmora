import { z } from 'zod';

/** snake_case ASCII identifier used across all data files. */
export const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id must be snake_case ascii');
export const LocalizedName = z.object({ es: z.string().min(1), en: z.string().min(1) });
export const Age = z.number().int().min(1).max(4);
export const ResourceId = z.enum(['food', 'wood', 'aether', 'stone']);
export type ResourceId = z.infer<typeof ResourceId>;

/** Integer resource cost. Keys follow ResourceId. */
export const Cost = z
  .object({
    food: z.number().int().nonnegative().optional(),
    wood: z.number().int().nonnegative().optional(),
    aether: z.number().int().nonnegative().optional(),
    stone: z.number().int().nonnegative().optional(),
  })
  .strict();
export type Cost = z.infer<typeof Cost>;

/** GDD §8.2 armor/attack classes. `civil` is a unit class only (no armor). */
export const ArmorClass = z.enum([
  'melee',
  'pierce',
  'infantry',
  'archer',
  'cavalry',
  'cavalry_archer',
  'spear',
  'siege',
  'building',
  'stone_defense',
  'wall',
  'ship',
  'custodian',
  'gunpowder',
  'unique',
  'camel_like',
  'hero',
]);
export type ArmorClass = z.infer<typeof ArmorClass>;
export const UnitClass = z.enum([...ArmorClass.options, 'civil']);
export type UnitClass = z.infer<typeof UnitClass>;

export const Notes = z.string().optional();
export const DamageMap = z.partialRecord(ArmorClass, z.number().nonnegative());
