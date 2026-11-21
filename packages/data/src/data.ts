import resources from '../json/resources.json';
import economy from '../json/economy.json';
import ages from '../json/ages.json';
import units from '../json/units.json';
import buildings from '../json/buildings.json';
import techs from '../json/techs.json';
import upgrades from '../json/upgrades.json';
import combat from '../json/combat.json';
import game from '../json/game.json';
import casa_valdren from '../json/factions/casa_valdren.json';
import clanes_skjald from '../json/factions/clanes_skjald.json';
import sultanato_de_azhar from '../json/factions/sultanato_de_azhar.json';
import concordia_tessaline from '../json/factions/concordia_tessaline.json';
import llanuras_de_ceniza from '../json/maps/llanuras_de_ceniza.json';
import difficulties from '../json/ai/difficulties.json';
import layers from '../json/ai/layers.json';
import rules from '../json/ai/rules.json';
import es from '../json/i18n/es.json';
import en from '../json/i18n/en.json';
import { crossCheck, parseSchemas, type GameData, type RawGameData } from './validate.js';

/** Bump on any balance change; recorded in every match and replay (GDD §18.1). */
export const DATA_VERSION = '0.2.1';

export const bundledRaw: RawGameData = {
  resources,
  economy,
  ages,
  units,
  buildings,
  techs,
  upgrades,
  combat,
  game,
  factions: { casa_valdren, clanes_skjald, sultanato_de_azhar, concordia_tessaline },
  maps: { llanuras_de_ceniza },
  ai: { difficulties, layers, rules },
  i18n: { es, en },
};

/** Parse + cross-validate raw data; throws with every error listed. */
export function loadGameData(raw: RawGameData = bundledRaw): GameData {
  const data = parseSchemas(raw);
  const { errors } = crossCheck(data);
  if (errors.length > 0) throw new Error(`Invalid game data:\n${errors.join('\n')}`);
  return data;
}

/** Convert a GDD-unit value to fixed point (economy.json fixedScale). Rounds half away from zero; integer-only math is the sim's job. */
export function toFixed(value: number, scale: number = economy.fixedScale): number {
  return Math.round(value * scale);
}
