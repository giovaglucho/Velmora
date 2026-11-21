import { z } from 'zod';
import { Age, ResourceId } from './common.js';

/**
 * Declarative modifier (GDD §9): {target, stat, op, value}.
 * target selector: `unit:<id>` | `line:<id>` | `class:<class>` | `building:<id>` | `buildings:all` |
 * `buildings:<group>` | `resource:<id>` | `global`.
 */
export const MODIFIER_STATS = [
  'hp', 'attack', 'attack_building', 'armor_melee', 'armor_pierce', 'range', 'speed', 'los', 'accuracy',
  'fire_rate', 'reload', 'carry', 'gather_rate', 'farm_amount', 'cost', 'cost_stone', 'cost_wood',
  'build_speed', 'research_speed', 'production_speed', 'tribute_fee', 'market_fee', 'trade_speed',
  'trade_income', 'age_cost', 'aether_income', 'min_range', 'unlock', 'script',
] as const;
export const ModifierOp = z.enum(['add', 'mul_pct', 'set', 'script']);

export const Modifier = z
  .object({
    target: z.string().regex(/^(unit|line|class|building|buildings|resource|global)(:[a-z0-9_]+)?$/),
    stat: z.enum(MODIFIER_STATS),
    op: ModifierOp,
    /** Numeric value. mul_pct is a percentage delta (+20 = +20%, -25 = -25%). */
    value: z.number().optional(),
    /** Alternative to `value`: value per age (key = age). Non-cumulative: replaces the previous age. */
    valueByAge: z.record(z.string().regex(/^[1-4]$/), z.number()).optional(),
    resource: ResourceId.optional(),
    fromAge: Age.optional(),
    /** Named script for op "script" (GDD §9 exceptions). */
    script: z.string().optional(),
    /** `self` (default), `allies` for team bonuses. */
    scope: z.enum(['self', 'allies']).optional(),
  })
  .strict()
  .refine((m) => m.op === 'script' || m.value !== undefined || m.valueByAge !== undefined, 'value or valueByAge required');
export type Modifier = z.infer<typeof Modifier>;
