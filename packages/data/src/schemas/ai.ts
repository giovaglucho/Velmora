import { z } from 'zod';
import { Id, LocalizedName, Notes } from './common.js';

/** GDD §12.2 rule: conditions -> actions (strings of the AI DSL). */
export const AiRule = z.object({ id: Id.optional(), when: z.array(z.string()).min(1), do: z.array(z.string()).min(1), notes: Notes }).strict();
export const AiRulesFile = z.object({ rules: z.array(AiRule) });

export const Difficulty = z
  .object({
    id: Id,
    name: LocalizedName,
    /** Seconds of game time. */
    reactionDelay: z.number().nonnegative(),
    micro: z.enum(['none', 'basic', 'yes', 'full']),
    /** Economic bonus in percent (-50 .. +20). */
    economyBonusPct: z.number().int(),
    visionCheats: z.boolean(),
    goal: z.string(),
    noAttackBeforeSeconds: z.number().int().optional(),
    maxAttacksPerAge: z.number().int().optional(),
    approxRating: z.number().int().optional(),
    notes: Notes,
  })
  .strict();
export const DifficultiesFile = z.object({
  difficulties: z.array(Difficulty).length(6),
  calibration: z.array(
    z.object({ difficulty: Id, plan: Id, reachAge: z.number().int().min(2).max(4), beforeSeconds: z.number().int() }),
  ),
});

export const AiLayersFile = z.object({
  layers: z.array(
    z.object({ id: Id, name: LocalizedName, intervalSeconds: z.number().positive(), minDifficulty: Id.optional(), responsibility: z.string() }),
  ),
});
