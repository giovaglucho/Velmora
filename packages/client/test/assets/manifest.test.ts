// A3 — manifest/spritesheet schema and the pure frame-resolution helpers of the asset loader.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '@reinos/data';
import {
  FALLBACK_APPEARANCE,
  parseAssetManifest,
  parseSheet,
  requiredUnitFrames,
  resolveAppearance,
  unitFrameName,
  usedAppearances,
} from '../../src/assets/manifest';

const DIR = join(import.meta.dirname, '..', '..', 'public', 'assets', 'provisional');
const manifest = parseAssetManifest(JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')));
const data = loadGameData();
const sprites = data.units.map((u) => u.sprite);

describe('provisional asset manifest', () => {
  it('the committed manifest.json validates against the client schema', () => {
    expect(manifest.dirs).toBe(8);
    expect(manifest.anim).toEqual({ idle: 1, walk: 4 });
    expect(manifest.textures.ground).toHaveLength(4);
  });

  it('rejects unknown keys and wrong versions (strict)', () => {
    expect(() => parseAssetManifest({ ...manifest, extra: 1 })).toThrow();
    expect(() => parseAssetManifest({ ...manifest, version: 2 })).toThrow();
  });

  it('every units.json sprite id has an appearance; unknown ids fall back to generic', () => {
    for (const s of sprites) expect(manifest.appearances[s], s).toBeDefined();
    expect(resolveAppearance(manifest, 'units/does_not_exist')).toBe(FALLBACK_APPEARANCE);
  });

  it('frame names follow <appearance>/<layer>/<dir>/<idle0|walkN>', () => {
    expect(unitFrameName('civil', 'body', 0, 0)).toBe('civil/body/0/idle0');
    expect(unitFrameName('infantry', 'team', 7, 4)).toBe('infantry/team/7/walk3');
  });

  it('usedAppearances always includes the fallback; requiredUnitFrames = apps × 2 layers × dirs × 5', () => {
    const apps = usedAppearances(manifest, sprites);
    expect(apps).toContain(FALLBACK_APPEARANCE);
    expect(new Set(apps).size).toBe(apps.length);
    expect(requiredUnitFrames(manifest, apps)).toHaveLength(apps.length * 2 * 8 * 5);
  });

  it('parseSheet accepts the spritesheet subset and rejects a frame without size', () => {
    const ok = {
      frames: { a: { frame: { x: 0, y: 0, w: 64, h: 96 } } },
      meta: { image: 'units.png', size: { w: 2048, h: 2048 } },
    };
    expect(parseSheet(ok).frames['a']?.frame.w).toBe(64);
    expect(() => parseSheet({ ...ok, frames: { a: { frame: { x: 0, y: 0 } } } })).toThrow();
  });

  // units.json is generated (gitignored): checked whenever `pnpm assets:gen` has run (always before build/e2e).
  const generated = existsSync(join(DIR, manifest.atlases.units.data));
  it.skipIf(!generated)('the generated units atlas contains every frame the loader needs', () => {
    const sheet = parseSheet(
      JSON.parse(readFileSync(join(DIR, manifest.atlases.units.data), 'utf8')),
    );
    const missing = requiredUnitFrames(manifest, usedAppearances(manifest, sprites)).filter(
      (n) => !(n in sheet.frames),
    );
    expect(missing).toEqual([]);
  });
});
