import { z } from 'zod';

const Sha = z.string().regex(/^[0-9a-f]{64}$/);
const Size = z.tuple([z.number().int().positive(), z.number().int().positive()]);

/**
 * `manifest.json` of the provisional asset set (ADR-006 §9). Mirrors what the client loader validates.
 * `appearances` maps every `sprite` id of units.json/buildings.json to an appearance; unknown ids fall back
 * to `generic` on the client.
 */
export const AssetManifest = z
  .object({
    version: z.literal(1),
    generator: z.literal('provisional-procedural'),
    seed: z.number().int().nonnegative(),
    dirs: z.literal(8),
    anim: z.object({ idle: z.literal(1), walk: z.literal(4) }).strict(),
    frameSize: Size,
    buildingFrameSize: Size,
    textures: z
      .object({
        ground: z.array(z.string()).length(4),
        water: z.string(),
        noise: z.string(),
        groundSize: z.literal(512),
        noiseSize: z.literal(256),
      })
      .strict(),
    atlases: z
      .object({
        units: z.object({ image: z.string(), data: z.string() }).strict(),
        buildings: z.object({ image: z.string(), data: z.string() }).strict(),
        ui: z.object({ image: z.string(), data: z.string() }).strict(),
      })
      .strict(),
    appearances: z.record(z.string(), z.string()),
    files: z.record(
      z.string(),
      z.object({ sha256: Sha, bytes: z.number().int().positive() }).strict(),
    ),
  })
  .strict();
export type AssetManifest = z.infer<typeof AssetManifest>;

/** Map unit `classes` (units.json) to a provisional appearance. */
export function unitAppearance(classes: readonly string[]): string {
  const has = (c: string): boolean => classes.includes(c);
  if (has('cavalry') || has('cavalry_archer') || has('camel_like')) return 'cavalry';
  if (has('civil')) return 'civil';
  if (has('archer') || has('gunpowder')) return 'ranged';
  if (has('infantry') || has('spear')) return 'infantry';
  return 'generic';
}
