// Unit atlas abstraction (ADR-006 §4.7/§9). Owner: render-engineer (R3).
// `UnitAtlas` is the integration point for art-pipeline's atlas (A2/A3): the loader implements it from
// units.json + manifest.json (frame name `<appearance>/<body|team>/<dir>/<idle0|walk0..3>`). Until then
// `createProceduralUnitAtlas()` provides in-memory frames.
import { BufferImageSource, Rectangle, Texture } from 'pixi.js';
import {
  FRAME_H,
  FRAME_W,
  PROC_DIRS,
  PROC_WALK_FRAMES,
  atlasSize,
  generateAtlas,
  provisionalTint,
} from './procSprites';

export interface UnitAtlas {
  /** Number of facing directions (8 provisional; the format admits 16). */
  readonly dirs: number;
  /** body (full colour) frame; `anim` 0 = idle, 1..4 = walk. */
  body(typeId: number, dir: number, anim: number): Texture;
  /** white team mask frame, tinted with the player colour. */
  team(typeId: number, dir: number, anim: number): Texture;
  /** tint applied to the body sprite (0xffffff for real art). */
  bodyTint(typeId: number): number;
  destroy(): void;
}

export function createProceduralUnitAtlas(): UnitAtlas {
  const dirs = PROC_DIRS;
  const { width, height } = atlasSize(dirs);
  const source = new BufferImageSource({
    resource: generateAtlas(dirs),
    width,
    height,
    format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha',
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
    autoGenerateMipmaps: false,
  });
  const frames: Texture[] = [];
  for (let d = 0; d < dirs; d++)
    for (let layer = 0; layer < 2; layer++)
      for (let a = 0; a <= PROC_WALK_FRAMES; a++)
        frames[(d * 2 + layer) * (PROC_WALK_FRAMES + 1) + a] = new Texture({
          source,
          frame: new Rectangle(a * FRAME_W, (d * 2 + layer) * FRAME_H, FRAME_W, FRAME_H),
        });
  const at = (layer: number, dir: number, anim: number) =>
    frames[(dir * 2 + layer) * (PROC_WALK_FRAMES + 1) + anim]!;
  return {
    dirs,
    body: (_t, dir, anim) => at(0, dir, anim),
    team: (_t, dir, anim) => at(1, dir, anim),
    bodyTint: provisionalTint,
    destroy: () => {
      for (const f of frames) f.destroy();
      source.destroy();
    },
  };
}
