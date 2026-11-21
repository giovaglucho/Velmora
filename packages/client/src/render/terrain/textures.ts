// Pixi-side terrain texture set (ADR-006 §4.6). Owner: render-engineer (R2).
// `TerrainTextures` is the integration point: art-pipeline's loader (A3) can build it from ground0..3.png and
// noise.png (call `prepareGroundTexture` / `prepareNoiseTexture` on them); until then the procedural set below is used.
import { BufferImageSource, Texture } from 'pixi.js';
import {
  PROC_GROUND_SIZE,
  PROC_NOISE_SIZE,
  generateForest,
  generateGround,
  generateNoise,
  generateWater,
} from './procGen';

export interface TerrainTextures {
  /** grass, dirt, sand, rock/ash — tileable, sampled with REPEAT and mipmaps. */
  readonly ground: readonly [Texture, Texture, Texture, Texture];
  /** Lake layer (blocked tiles classified as water), same sampling as `ground`. */
  readonly water: Texture;
  /** Forest layer (blocked tiles classified as forest), same sampling as `ground`. */
  readonly forest: Texture;
  /** RGBA = 4 independent tileable noises, REPEAT. */
  readonly noise: Texture;
}

/** REPEAT + trilinear mipmaps (the texture must still be unused by the GPU). */
export function prepareGroundTexture(t: Texture): Texture {
  const s = t.source;
  s.addressMode = 'repeat';
  s.scaleMode = 'linear';
  s.mipmapFilter = 'linear';
  s.autoGenerateMipmaps = true;
  return t;
}
export function prepareNoiseTexture(t: Texture): Texture {
  const s = t.source;
  s.addressMode = 'repeat';
  s.scaleMode = 'linear';
  s.mipmapFilter = 'nearest';
  s.alphaMode = 'no-premultiply-alpha';
  return t;
}

function rgba(data: Uint8Array, size: number, mip: boolean): Texture {
  const source = new BufferImageSource({
    resource: data,
    width: size,
    height: size,
    format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha',
    addressMode: 'repeat',
    scaleMode: 'linear',
    mipmapFilter: mip ? 'linear' : 'nearest',
    autoGenerateMipmaps: mip,
  });
  return new Texture({ source });
}

/** Forest layer from raw RGBA bytes (REPEAT + mipmaps), shared by the loader and the procedural fallback. */
export function proceduralForestTexture(data: Uint8Array, size: number): Texture {
  return rgba(data, size, true);
}

export function createProceduralTerrainTextures(): TerrainTextures {
  const g = (k: number) => rgba(generateGround(k, PROC_GROUND_SIZE), PROC_GROUND_SIZE, true);
  return {
    ground: [g(0), g(1), g(2), g(3)],
    water: rgba(generateWater(PROC_GROUND_SIZE), PROC_GROUND_SIZE, true),
    forest: rgba(generateForest(PROC_GROUND_SIZE), PROC_GROUND_SIZE, true),
    noise: rgba(generateNoise(PROC_NOISE_SIZE), PROC_NOISE_SIZE, false),
  };
}

/** Per-vertex weight texture ((W+1)×(H+1) RGBA8). `hard` = nearest sampling (seam-metric control only). */
export function createSplatTexture(
  weights: Uint8Array,
  width: number,
  height: number,
  hard = false,
): Texture {
  const source = new BufferImageSource({
    resource: weights,
    width: width + 1,
    height: height + 1,
    format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha', // weights live in RGBA: never premultiply
    addressMode: 'clamp-to-edge',
    scaleMode: hard ? 'nearest' : 'linear',
    autoGenerateMipmaps: false,
  });
  return new Texture({ source });
}
