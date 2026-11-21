import { z } from 'zod';
import { Id, LocalizedName } from './common.js';

const Range = z.tuple([z.number(), z.number()]);

export const MapObject = z
  .object({
    type: Id,
    perPlayer: z.number().int().optional(),
    total: z.number().int().optional(),
    dist: Range.optional(),
    group: z.number().int().optional(),
    tiles: z.number().int().optional(),
    avoidPlayers: z.number().optional(),
  })
  .strict()
  .refine((o) => o.perPlayer !== undefined || o.total !== undefined, 'perPlayer or total required');

/** GDD §11.4 declarative map script. */
export const MapScript = z
  .object({
    id: Id,
    name: LocalizedName.optional(),
    baseTerrain: z.enum(['grass', 'dirt', 'sand', 'snow', 'ash']),
    players: z.object({ landPercent: z.number(), baseSize: z.number(), fuzz: z.number() }),
    elevation: z.object({ hills: z.number().int(), maxHeight: z.number().int().min(0).max(7) }),
    forests: z.object({ clumps: z.number().int(), size: Range, avoidPlayers: z.number() }),
    objects: z.array(MapObject),
    notes: z.string().optional(),
  })
  .strict();
export type MapScript = z.infer<typeof MapScript>;
