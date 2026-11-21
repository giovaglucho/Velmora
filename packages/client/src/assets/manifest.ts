// ADR-006 §9 — provisional asset manifest schema. Owner: art-pipeline (A).
import { z } from 'zod';

export const manifestSchema = z.strictObject({
  version: z.number().int().positive(),
  dirs: z.number().int().positive(),
  anim: z.strictObject({
    idle: z.number().int().nonnegative(),
    walk: z.number().int().nonnegative(),
  }),
  frameSize: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  /** units.json `sprite` id → appearance. Unknown id falls back to `generic`. */
  appearances: z.record(z.string(), z.string()),
  /** file → sha256 */
  files: z.record(z.string(), z.string()),
});

export type AssetManifest = z.infer<typeof manifestSchema>;
