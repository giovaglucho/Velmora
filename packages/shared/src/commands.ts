// Command types and shape validation (ADR-005 §5). No dependencies; also used by the relay.
import { MAX_COORD_FX } from './fixed';
import { MAX_PLAYERS } from './simconfig';

export type CommandType = 'move' | 'stop';
export const COMMAND_CODE: Readonly<Record<CommandType, number>> = { move: 1, stop: 2 };
export const MAX_CMD_UNITS = 1024;
/** Largest valid entity id (31 bits, ADR-005 §3). */
export const MAX_EID = 0x7fffffff;

export interface PosTarget {
  kind: 'pos';
  x: number;
  y: number;
}

export interface Command {
  /** Execution turn (set by the relay/client; the sim only requires turn === current turn). */
  turn: number;
  /** 0..maxPlayers-1 */
  playerId: number;
  type: CommandType;
  /** Entity ids. */
  unitIds: number[];
  target: PosTarget | null;
  /** F1: always null (reserved). */
  payload: null;
}

function isInt(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
}

function hasExactKeys(o: object, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  if (own.length !== keys.length) return false;
  for (let i = 0; i < keys.length; i++) if (!Object.hasOwn(o, keys[i] as string)) return false;
  return true;
}

const COMMAND_KEYS = ['turn', 'playerId', 'type', 'unitIds', 'target', 'payload'] as const;
const TARGET_KEYS = ['kind', 'x', 'y'] as const;

/** Returns null when `c` is a well-formed Command, else a short reason (used in error paths). */
export function commandShapeError(c: unknown): string | null {
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return 'not an object';
  if (!hasExactKeys(c, COMMAND_KEYS)) return 'keys must be exactly ' + COMMAND_KEYS.join(',');
  const o = c as Record<string, unknown>;
  if (!isInt(o.turn, 0, MAX_EID)) return 'turn must be an integer in [0, 2^31)';
  if (!isInt(o.playerId, 0, MAX_PLAYERS - 1)) return 'playerId out of range';
  if (o.type !== 'move' && o.type !== 'stop') return 'unknown type';
  const ids = o.unitIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_CMD_UNITS)
    return 'unitIds must be an array of 1..' + MAX_CMD_UNITS;
  for (let i = 0; i < ids.length; i++)
    if (!isInt(ids[i], 0, MAX_EID)) return 'unitIds[' + i + '] must be an integer eid';
  if (o.payload !== null) return 'payload must be null';
  if (o.type === 'stop') return o.target === null ? null : 'stop requires target null';
  const t = o.target;
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return 'move requires a pos target';
  if (!hasExactKeys(t, TARGET_KEYS)) return 'target keys must be exactly kind,x,y';
  const p = t as Record<string, unknown>;
  if (p.kind !== 'pos') return 'target.kind must be "pos"';
  if (!isInt(p.x, 0, MAX_COORD_FX)) return 'target.x out of range';
  if (!isInt(p.y, 0, MAX_COORD_FX)) return 'target.y out of range';
  return null;
}

export function validateCommandShape(c: unknown): c is Command {
  return commandShapeError(c) === null;
}
