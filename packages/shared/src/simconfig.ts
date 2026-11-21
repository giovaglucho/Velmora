// Match configuration (ADR-005 §7) and its validator.
import type { Fx } from './fixed';
import { MAX_COORD_FX } from './fixed';

export const MAX_PLAYERS = 8;
export const MAX_ENTITIES_LIMIT = 65535;
export const DEFAULT_MAX_ENTITIES = 4096;
export const MAX_MAP_SIDE = 512;

export interface MapSpec {
  /** Tiles, 1..512. */
  width: number;
  /** Tiles, 1..512. */
  height: number;
  /** Alternating run lengths in row-major order, starting with FREE; sum = width * height. */
  blockedRle: number[];
}
export interface SpawnSpec {
  /** Id from units.json. */
  unit: string;
  owner: number;
  x: Fx;
  y: Fx;
}
export interface SimConfig {
  /** 1..8 */
  maxPlayers: number;
  /** 1..65535 (default 4096) */
  maxEntities: number;
  map: MapSpec;
  /** Created in array order before tick 0. */
  spawns: SpawnSpec[];
}

function fail(path: string, msg: string): never {
  throw new Error(path + ': ' + msg);
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function int(v: unknown, lo: number, hi: number, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi)
    fail(path, 'must be an integer in [' + lo + ', ' + hi + ']');
  return v;
}
function exactKeys(o: Record<string, unknown>, keys: readonly string[], path: string): void {
  const own = Object.keys(o);
  for (let i = 0; i < own.length; i++)
    if (!keys.includes(own[i] as string)) fail(path, 'unexpected key "' + own[i] + '"');
  for (let i = 0; i < keys.length; i++)
    if (!Object.hasOwn(o, keys[i] as string)) fail(path, 'missing key "' + keys[i] + '"');
}

/** Validates a SimConfig, returning a canonical copy (keys in declaration order). Throws Error with the field path. */
export function validateSimConfig(x: unknown, path = 'config'): SimConfig {
  if (!isObj(x)) return fail(path, 'must be an object');
  exactKeys(x, ['maxPlayers', 'maxEntities', 'map', 'spawns'], path);
  const maxPlayers = int(x.maxPlayers, 1, MAX_PLAYERS, path + '.maxPlayers');
  const maxEntities = int(x.maxEntities, 1, MAX_ENTITIES_LIMIT, path + '.maxEntities');
  const m = x.map;
  if (!isObj(m)) return fail(path + '.map', 'must be an object');
  exactKeys(m, ['width', 'height', 'blockedRle'], path + '.map');
  const width = int(m.width, 1, MAX_MAP_SIDE, path + '.map.width');
  const height = int(m.height, 1, MAX_MAP_SIDE, path + '.map.height');
  if (!Array.isArray(m.blockedRle)) return fail(path + '.map.blockedRle', 'must be an array');
  const rle: number[] = [];
  let sum = 0;
  for (let i = 0; i < m.blockedRle.length; i++) {
    const v = int(m.blockedRle[i], 0, width * height, path + '.map.blockedRle[' + i + ']');
    rle.push(v);
    sum += v;
  }
  if (sum !== width * height)
    fail(path + '.map.blockedRle', 'runs must sum to width*height (' + width * height + ')');
  if (!Array.isArray(x.spawns)) return fail(path + '.spawns', 'must be an array');
  const spawns: SpawnSpec[] = [];
  for (let i = 0; i < x.spawns.length; i++) {
    const p = path + '.spawns[' + i + ']';
    const s: unknown = x.spawns[i];
    if (!isObj(s)) return fail(p, 'must be an object');
    exactKeys(s, ['unit', 'owner', 'x', 'y'], p);
    if (typeof s.unit !== 'string' || s.unit.length === 0) fail(p + '.unit', 'must be a string');
    spawns.push({
      unit: s.unit as string,
      owner: int(s.owner, 0, maxPlayers - 1, p + '.owner'),
      x: int(s.x, 0, MAX_COORD_FX, p + '.x'),
      y: int(s.y, 0, MAX_COORD_FX, p + '.y'),
    });
  }
  return { maxPlayers, maxEntities, map: { width, height, blockedRle: rle }, spawns };
}
