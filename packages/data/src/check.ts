import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { crossCheck, formatZodError, parseSchemas, type RawGameData } from './validate.js';
import { bundledRaw } from './data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'json');
const errors: string[] = [];
const read = (rel: string): unknown => {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (e) {
    errors.push(`${rel}: ${(e as Error).message}`);
    return undefined;
  }
};
const readDir = (dir: string): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const f of readdirSync(join(root, dir))
    .filter((n) => n.endsWith('.json'))
    .sort())
    out[f.replace(/\.json$/, '')] = read(`${dir}/${f}`);
  return out;
};

const raw: RawGameData = {
  resources: read('resources.json'),
  economy: read('economy.json'),
  ages: read('ages.json'),
  units: read('units.json'),
  buildings: read('buildings.json'),
  techs: read('techs.json'),
  upgrades: read('upgrades.json'),
  combat: read('combat.json'),
  game: read('game.json'),
  factions: readDir('factions'),
  maps: readDir('maps'),
  ai: {
    difficulties: read('ai/difficulties.json'),
    layers: read('ai/layers.json'),
    rules: read('ai/rules.json'),
  },
  i18n: { es: read('i18n/es.json'), en: read('i18n/en.json') },
};

// The bundled loader (data.ts) must import every file on disk.
for (const dir of ['factions', 'maps'] as const) {
  const bundled = Object.keys(bundledRaw[dir]).sort().join(',');
  const disk = Object.keys(raw[dir]).sort().join(',');
  if (bundled !== disk)
    errors.push(`src/data.ts imports [${bundled}] but json/${dir}/ has [${disk}]`);
}

if (errors.length === 0) {
  try {
    const data = parseSchemas(raw);
    const x = crossCheck(data);
    errors.push(...x.errors);
    const counts: Record<string, number> = {
      resources: data.resources.resources.length,
      ages: data.ages.ages.length,
      units: data.units.length,
      buildings: data.buildings.length,
      techs: data.techs.length,
      upgrades: data.upgrades.length,
      factions: data.factions.length,
      maps: data.maps.length,
      difficulties: data.ai.difficulties.difficulties.length,
      aiRules: data.ai.rules.rules.length,
      i18nKeys: Object.keys(data.i18n.es.strings).length,
      economySources: data.economy.sources.length,
      gatherRates: data.economy.gatherRates.length,
    };
    console.log(
      'data:check counts ->',
      Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
    );
    if (x.warnings.length)
      console.log(
        `data:check warnings (${x.warnings.length}, values the GDD leaves pending; see COVERAGE.md)`,
      );
  } catch (e) {
    errors.push(...(e instanceof ZodError ? formatZodError('data', e) : [String(e)]));
  }
}
if (errors.length > 0) {
  console.error(`data:check FAILED with ${errors.length} error(s):`);
  for (const m of errors) console.error(' - ' + m);
  process.exit(1);
}
console.log('data:check OK');
