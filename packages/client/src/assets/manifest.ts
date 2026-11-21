// ADR-006 §9 — provisional asset manifest + spritesheet schemas, and the pure helpers built on them.
// Owner: art-pipeline (schema) + render-engineer (consumption). PURE: no Pixi, no DOM, so Node tests cover it.
// The schema mirrors `tools/asset-pipeline/src/provisional/manifest.ts` (the client must not depend on the Node
// generator package); `test/assets/manifest.test.ts` parses the committed manifest.json with this copy.
import { z } from 'zod';

const Sha = z.string().regex(/^[0-9a-f]{64}$/);
const Size = z.tuple([z.number().int().positive(), z.number().int().positive()]);
const Atlas = z.strictObject({ image: z.string(), data: z.string() });

export const manifestSchema = z.strictObject({
  version: z.literal(1),
  generator: z.literal('provisional-procedural'),
  seed: z.number().int().nonnegative(),
  dirs: z.literal(8),
  anim: z.strictObject({ idle: z.literal(1), walk: z.literal(4) }),
  frameSize: Size,
  buildingFrameSize: Size,
  textures: z.strictObject({
    ground: z.array(z.string()).length(4),
    water: z.string(),
    noise: z.string(),
    groundSize: z.literal(512),
    noiseSize: z.literal(256),
  }),
  atlases: z.strictObject({ units: Atlas, buildings: Atlas, ui: Atlas }),
  /** units.json / buildings.json `sprite` id → appearance. Unknown ids fall back to `generic`. */
  appearances: z.record(z.string(), z.string()),
  files: z.record(z.string(), z.strictObject({ sha256: Sha, bytes: z.number().int().positive() })),
});
export type AssetManifest = z.infer<typeof manifestSchema>;

/** Pixi/TexturePacker-style spritesheet data (the subset the loader needs). */
export const sheetSchema = z.object({
  frames: z.record(
    z.string(),
    z.object({
      frame: z.object({
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        w: z.number().int().positive(),
        h: z.number().int().positive(),
      }),
    }),
  ),
  meta: z.object({
    image: z.string(),
    size: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  }),
});
export type SheetData = z.infer<typeof sheetSchema>;

export function parseAssetManifest(json: unknown): AssetManifest {
  return manifestSchema.parse(json);
}
export function parseSheet(json: unknown): SheetData {
  return sheetSchema.parse(json);
}

/** Appearance used when a unit's `sprite` id is not in the manifest (ADR-006 §9: no failure). */
export const FALLBACK_APPEARANCE = 'generic';

export type UnitLayerName = 'body' | 'team';

/** `<appearance>/<body|team>/<dir>/<idle0|walk0..3>`; `anim` 0 = idle, 1..4 = walk 0..3. */
export function unitFrameName(
  appearance: string,
  layer: UnitLayerName,
  dir: number,
  anim: number,
): string {
  return `${appearance}/${layer}/${dir}/${anim === 0 ? 'idle0' : `walk${anim - 1}`}`;
}

/** Appearance of a unit given its units.json `sprite` id. */
export function resolveAppearance(manifest: AssetManifest, spriteId: string): string {
  return manifest.appearances[spriteId] ?? FALLBACK_APPEARANCE;
}

/** Distinct appearances used by the units (first-seen order), plus the fallback. */
export function usedAppearances(manifest: AssetManifest, spriteIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of spriteIds) {
    const a = resolveAppearance(manifest, id);
    if (!out.includes(a)) out.push(a);
  }
  if (!out.includes(FALLBACK_APPEARANCE)) out.push(FALLBACK_APPEARANCE);
  return out;
}

/** Names of every unit frame that `usedAppearances` implies, for completeness checks. */
export function requiredUnitFrames(
  manifest: AssetManifest,
  appearances: readonly string[],
): string[] {
  const names: string[] = [];
  const anims = manifest.anim.idle + manifest.anim.walk;
  for (const a of appearances)
    for (const layer of ['body', 'team'] as const)
      for (let d = 0; d < manifest.dirs; d++)
        for (let k = 0; k < anims; k++) names.push(unitFrameName(a, layer, d, k));
  return names;
}
