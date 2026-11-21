import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadGameData } from '@reinos/data';
import { encodePng, sha256 } from './png.js';
import {
  GROUND_FILES,
  GROUND_NAMES,
  GROUND_SIZE,
  NOISE_SIZE,
  generateGround,
  generateNoise,
  terrainSeeds,
} from './terrain.js';
import {
  ANIM,
  BUILDING_FRAME,
  DIRS,
  UNIT_FRAME,
  buildBuildingAtlas,
  buildUiAtlas,
  buildUnitAtlas,
} from './sprites.js';
import { AssetManifest, unitAppearance } from './manifest.js';

/** The single fixed seed of the provisional asset set. Changing it changes every PNG. */
export const ASSET_SEED = 0x5eed2a11;

export interface GeneratedFile {
  name: string;
  bytes: Uint8Array;
}

function jsonBytes(v: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(v, null, pretty ? 2 : undefined) + '\n', 'utf8');
}

/** Generate the whole set in memory. Pure and deterministic: same bytes on every call. */
export function generateAll(): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const seeds = terrainSeeds(ASSET_SEED);
  for (const g of GROUND_NAMES)
    files.push({ name: GROUND_FILES[g], bytes: encodePng(generateGround(g, seeds[g])) });
  files.push({ name: 'noise.png', bytes: encodePng(generateNoise(seeds.noise)) });

  const units = buildUnitAtlas();
  files.push({ name: 'units.png', bytes: encodePng(units.image) });
  files.push({ name: 'units.json', bytes: jsonBytes(units.json) });
  const buildings = buildBuildingAtlas();
  files.push({ name: 'buildings.png', bytes: encodePng(buildings.image) });
  files.push({ name: 'buildings.json', bytes: jsonBytes(buildings.json) });
  const ui = buildUiAtlas();
  files.push({ name: 'ui.png', bytes: encodePng(ui.image) });
  files.push({ name: 'ui.json', bytes: jsonBytes(ui.json) });

  const data = loadGameData();
  const appearances: Record<string, string> = {};
  for (const u of data.units) appearances[u.sprite] = unitAppearance(u.classes);
  for (const b of data.buildings) appearances[b.sprite] = 'building';

  const manifest: AssetManifest = AssetManifest.parse({
    version: 1,
    generator: 'provisional-procedural',
    seed: ASSET_SEED,
    dirs: DIRS,
    anim: ANIM,
    frameSize: [...UNIT_FRAME],
    buildingFrameSize: [...BUILDING_FRAME],
    textures: {
      ground: GROUND_NAMES.slice(0, 4).map((g) => GROUND_FILES[g]),
      water: GROUND_FILES.water,
      noise: 'noise.png',
      groundSize: GROUND_SIZE,
      noiseSize: NOISE_SIZE,
    },
    atlases: {
      units: { image: 'units.png', data: 'units.json' },
      buildings: { image: 'buildings.png', data: 'buildings.json' },
      ui: { image: 'ui.png', data: 'ui.json' },
    },
    appearances,
    files: Object.fromEntries(
      files.map((f) => [f.name, { sha256: sha256(f.bytes), bytes: f.bytes.length }]),
    ),
  });
  files.push({ name: 'manifest.json', bytes: jsonBytes(manifest, true) });
  return files;
}

export function writeAll(outDir: string): GeneratedFile[] {
  mkdirSync(outDir, { recursive: true });
  const files = generateAll();
  for (const f of files) writeFileSync(join(outDir, f.name), f.bytes);
  return files;
}
