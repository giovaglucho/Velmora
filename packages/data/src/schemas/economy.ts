import { z } from 'zod';
import { Id, LocalizedName, ResourceId, Notes, Cost } from './common.js';

/** [min, max] with min <= max. */
export const Range = z
  .tuple([z.number(), z.number()])
  .refine(([min, max]) => min <= max, { message: 'range min must be <= max' });

export const GatherRate = z.strictObject({
  id: Id,
  resource: ResourceId,
  perSecond: z.number().positive(),
  perMinute: z.number().positive(),
  notes: Notes,
});

export const ResourceSource = z.strictObject({
  id: Id,
  name: LocalizedName,
  resource: ResourceId.optional(),
  amount: z.number().int().positive().optional(),
  amountMax: z.number().int().positive().optional(),
  /** Per-player count in 1v1 (or [min,max]). */
  count: z.union([z.number().int(), Range]).optional(),
  tilesPerPatch: z.number().int().optional(),
  /** Distance to the Ciudadela in tiles. */
  dist: Range.optional(),
  placements: z
    .array(
      z.strictObject({ count: z.number().int(), tiles: z.number().int().optional(), dist: Range }),
    )
    .optional(),
  rotPerSecond: z.number().optional(),
  cost: Cost.optional(),
  size: z.number().int().optional(),
  buildTime: z.number().optional(),
  requires: z.string().optional(),
  notes: Notes,
});

export const EconomyFile = z.strictObject({
  /** Convention: values in this file/units.json are in GDD units; sim converts with round(x * fixedScale). */
  fixedScale: z.literal(1000),
  settler: z.strictObject({
    unit: Id,
    startUnits: z.record(Id, z.number().int()),
    carry: z.strictObject({ default: z.number().int(), hunt: z.number().int() }),
    notes: Notes,
  }),
  gatherRates: z.array(GatherRate),
  rateModel: z.string(),
  farm: z.strictObject({
    bufferMax: z.number(),
    bufferRatePerSecond: z.number(),
    takePerHitFraction: z.number(),
    notes: Notes,
  }),
  sources: z.array(ResourceSource),
  market: z.strictObject({
    basePrice: z.number().int(),
    stonePrice: z.number().int(),
    commissionPct: z.number(),
    tradeLot: z.number().int(),
    priceStep: z.number().int(),
    minPrice: z.number().int(),
    maxPrice: z.number().int(),
    tradable: z.array(ResourceId),
    currency: ResourceId,
    sharedPrices: z.boolean(),
    notes: Notes,
  }),
  tradeCart: z.strictObject({
    unit: Id,
    formula: z.strictObject({
      coefficient: z.number(),
      offset: z.number(),
      minDistTiles: z.number().int(),
    }),
    cogPenaltyPct: z.number(),
    notes: Notes,
  }),
  tribute: z.strictObject({ baseFeePct: z.number(), notes: Notes }),
  crownShards: z.strictObject({
    perStandardMap: z.number().int(),
    aetherPerSecondEach: z.number(),
    carrier: z.string(),
    notes: Notes,
  }),
});
export type EconomyFile = z.infer<typeof EconomyFile>;
