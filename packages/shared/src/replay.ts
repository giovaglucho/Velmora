// Replay format (ADR-005 §9). Parsing text lives in tools/headless (JSON.parse is banned here).
import { commandShapeError, type Command } from './commands';
import { validateSimConfig, type SimConfig } from './simconfig';

export const REPLAY_FORMAT_VERSION = 1;
export const MAX_REPLAY_TURNS = 0x7fffffff;

export interface ReplayTurn {
  /** Execution turn (0-based). */
  n: number;
  cmds: Command[];
}

export interface Replay {
  version: typeof REPLAY_FORMAT_VERSION;
  /** uint32 */
  seed: number;
  dataVersion: string;
  config: SimConfig;
  /** Turns to simulate; turns without commands are omitted from `turns`. */
  totalTurns: number;
  /** n strictly ascending, cmds non-empty, each cmd.turn === n, n < totalTurns. */
  turns: ReplayTurn[];
  /** sim.hashFull() after totalTurns turns. */
  finalHash: number;
  /** [completed turn, sim.hash()] every K turns; helps locate the first desync. */
  checkpoints?: [number, number][];
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

const TOP_KEYS = ['version', 'seed', 'dataVersion', 'config', 'totalTurns', 'turns', 'finalHash'];

/** Validates an untrusted value as a Replay and returns a canonical copy. Throws Error naming the invalid field. */
export function validateReplay(x: unknown): Replay {
  if (!isObj(x)) return fail('replay', 'must be an object');
  const own = Object.keys(x);
  for (let i = 0; i < own.length; i++) {
    const k = own[i] as string;
    if (!TOP_KEYS.includes(k) && k !== 'checkpoints') fail('replay', 'unexpected key "' + k + '"');
  }
  for (let i = 0; i < TOP_KEYS.length; i++)
    if (!Object.hasOwn(x, TOP_KEYS[i] as string))
      fail('replay', 'missing key "' + TOP_KEYS[i] + '"');
  if (x.version !== REPLAY_FORMAT_VERSION)
    fail('replay.version', 'unsupported (expected ' + REPLAY_FORMAT_VERSION + ')');
  const seed = int(x.seed, 0, 0xffffffff, 'replay.seed');
  if (typeof x.dataVersion !== 'string' || x.dataVersion.length === 0)
    fail('replay.dataVersion', 'must be a non-empty string');
  const config = validateSimConfig(x.config, 'replay.config');
  const totalTurns = int(x.totalTurns, 0, MAX_REPLAY_TURNS, 'replay.totalTurns');
  if (!Array.isArray(x.turns)) return fail('replay.turns', 'must be an array');
  const turns: ReplayTurn[] = [];
  let prev = -1;
  for (let i = 0; i < x.turns.length; i++) {
    const p = 'replay.turns[' + i + ']';
    const t: unknown = x.turns[i];
    if (!isObj(t)) return fail(p, 'must be an object');
    const keys = Object.keys(t);
    if (keys.length !== 2 || !Object.hasOwn(t, 'n') || !Object.hasOwn(t, 'cmds'))
      fail(p, 'keys must be exactly n,cmds');
    const n = int(t.n, 0, totalTurns - 1, p + '.n');
    if (n <= prev) fail(p + '.n', 'turns must be strictly ascending');
    prev = n;
    if (!Array.isArray(t.cmds) || t.cmds.length === 0) fail(p + '.cmds', 'must be non-empty');
    const cmds: Command[] = [];
    for (let j = 0; j < (t.cmds as unknown[]).length; j++) {
      const c: unknown = (t.cmds as unknown[])[j];
      const err = commandShapeError(c);
      if (err !== null) fail(p + '.cmds[' + j + ']', err);
      const cmd = c as Command;
      if (cmd.turn !== n) fail(p + '.cmds[' + j + '].turn', 'must equal turn n (' + n + ')');
      cmds.push({
        turn: cmd.turn,
        playerId: cmd.playerId,
        type: cmd.type,
        unitIds: cmd.unitIds.slice(),
        target: cmd.target === null ? null : { kind: 'pos', x: cmd.target.x, y: cmd.target.y },
        payload: null,
      });
    }
    turns.push({ n, cmds });
  }
  const finalHash = int(x.finalHash, 0, 0xffffffff, 'replay.finalHash');
  const out: Replay = {
    version: REPLAY_FORMAT_VERSION,
    seed,
    dataVersion: x.dataVersion,
    config,
    totalTurns,
    turns,
    finalHash,
  };
  if (Object.hasOwn(x, 'checkpoints')) {
    if (!Array.isArray(x.checkpoints)) return fail('replay.checkpoints', 'must be an array');
    const cps: [number, number][] = [];
    let last = 0;
    for (let i = 0; i < x.checkpoints.length; i++) {
      const p = 'replay.checkpoints[' + i + ']';
      const e: unknown = x.checkpoints[i];
      if (!Array.isArray(e) || e.length !== 2) return fail(p, 'must be a [turn, hash] pair');
      const t = int(e[0], 1, totalTurns, p + '[0]');
      if (t <= last) fail(p + '[0]', 'checkpoints must be strictly ascending');
      last = t;
      cps.push([t, int(e[1], 0, 0xffffffff, p + '[1]')]);
    }
    out.checkpoints = cps;
  }
  return out;
}

/** Canonical JSON: keys in declaration order, no extra whitespace; byte-reproducible. */
export function serializeReplay(r: Replay): string {
  const v = validateReplay(r);
  const canon: Record<string, unknown> = {
    version: v.version,
    seed: v.seed,
    dataVersion: v.dataVersion,
    config: {
      maxPlayers: v.config.maxPlayers,
      maxEntities: v.config.maxEntities,
      map: {
        width: v.config.map.width,
        height: v.config.map.height,
        blockedRle: v.config.map.blockedRle,
      },
      spawns: v.config.spawns.map((s) => ({ unit: s.unit, owner: s.owner, x: s.x, y: s.y })),
    },
    totalTurns: v.totalTurns,
    turns: v.turns.map((t) => ({
      n: t.n,
      cmds: t.cmds.map((c) => ({
        turn: c.turn,
        playerId: c.playerId,
        type: c.type,
        unitIds: c.unitIds,
        target: c.target === null ? null : { kind: 'pos', x: c.target.x, y: c.target.y },
        payload: null,
      })),
    })),
    finalHash: v.finalHash,
  };
  if (v.checkpoints !== undefined) canon.checkpoints = v.checkpoints;
  return JSON.stringify(canon);
}
