// Deterministic scenario generator (ADR-005 plan D2). Uses its own PRNG stream, seeded from the
// scenario seed, entirely outside the simulation state. Produces a Replay: map with clustered
// obstacles + a sealed pocket (unreachable goals), two armies, and move/stop commands.
import {
  REPLAY_FORMAT_VERSION,
  simDataHash,
  createPrng,
  fxToTile,
  type Command,
  type Prng,
  type Replay,
  type SimConfig,
  type SimData,
  type SpawnSpec,
} from '@reinos/shared';
import { createSim, makeEid, type SimOptions } from '@reinos/sim';

/** Bump when the generator output changes for the same options (invalidates golden.json). */
export const GENERATOR_VERSION = 1;

export interface ScenarioOptions {
  seed: number;
  /** Total units; split evenly between 2 players. */
  units: number;
  /** Turns of 4 ticks. */
  turns: number;
  /** Square map side in tiles. */
  mapSide: number;
  /** Target share of blocked tiles, 0..100. */
  obstaclePct: number;
  /** Max units per command (<= 100 in the plan). */
  groupMax: number;
  /** A random command is issued every this many turns. */
  cmdEvery: number;
  /** One in this many `move` commands targets the sealed pocket (unreachable goal). */
  pocketEvery: number;
  /** Checkpoint spacing in turns. */
  checkpointEvery: number;
}

export type ScenarioName = 'thousand' | 'small';

export const SCENARIOS: Readonly<Record<ScenarioName, Omit<ScenarioOptions, 'seed'>>> = {
  // 1000 units x 10 000 ticks (2500 turns).
  thousand: {
    units: 1000,
    turns: 2500,
    mapSide: 200,
    obstaclePct: 25,
    groupMax: 100,
    cmdEvery: 5,
    pocketEvery: 12,
    checkpointEvery: 100,
  },
  // Fast scenario for unit tests: 50 units x 500 ticks.
  small: {
    units: 50,
    turns: 125,
    mapSide: 64,
    obstaclePct: 20,
    groupMax: 25,
    cmdEvery: 4,
    pocketEvery: 6,
    checkpointEvery: 25,
  },
};

export function scenarioOptions(name: ScenarioName, seed: number): ScenarioOptions {
  return { ...SCENARIOS[name], seed };
}

export interface ScenarioStats {
  units: number;
  commands: number;
  moveCommands: number;
  stopCommands: number;
  pocketCommands: number;
  /** Units whose tile differs from the spawn tile at some turn boundary. */
  unitsMoved: number;
  /** Blocked share actually generated, in permille. */
  blockedPermille: number;
}

export interface Scenario {
  replay: Replay;
  stats: ScenarioStats;
  /** Wall-clock of the generating run, ms (informative). */
  elapsedMs: number;
}

const STRIP = (side: number): number => Math.max(4, Math.trunc(side / 6));

export function rleEncode(blocked: Uint8Array): number[] {
  const runs: number[] = [];
  let cur = 0;
  let len = 0;
  for (let i = 0; i < blocked.length; i++) {
    const b = blocked[i] as number;
    if (b === cur) len++;
    else {
      runs.push(len);
      cur = b;
      len = 1;
    }
  }
  runs.push(len);
  return runs;
}

export interface GeneratedMap {
  blocked: Uint8Array;
  /** Tile at the centre of the sealed pocket (reachable from nowhere). */
  pocket: { tx: number; ty: number };
}

/** Clustered blobs outside both spawn strips plus a sealed 5x5 room (3x3 free interior). */
export function generateMap(rng: Prng, side: number, obstaclePct: number): GeneratedMap {
  const blocked = new Uint8Array(side * side);
  const strip = STRIP(side);
  const target = Math.trunc((side * side * obstaclePct) / 100);
  let count = 0;
  let guard = 0;
  while (count < target && guard++ < 100000) {
    const cx = strip + rng.nextInt(side - 2 * strip);
    const cy = rng.nextInt(side);
    const r = 2 + rng.nextInt(5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < strip || x >= side - strip || y < 0 || y >= side) continue;
        if (dx * dx + dy * dy > r * r - rng.nextInt(r + 1)) continue;
        const i = y * side + x;
        if (blocked[i] === 0) {
          blocked[i] = 1;
          count++;
        }
      }
    }
  }
  const px = Math.trunc(side / 2) - 2;
  const py = Math.trunc(side / 2) - 2;
  for (let dy = 0; dy < 5; dy++)
    for (let dx = 0; dx < 5; dx++) {
      const ring = dx === 0 || dy === 0 || dx === 4 || dy === 4;
      blocked[(py + dy) * side + px + dx] = ring ? 1 : 0;
    }
  return { blocked, pocket: { tx: px + 2, ty: py + 2 } };
}

const tileCentreFx = (t: number): number => t * 1000 + 500;

export interface ScenarioWorld {
  config: SimConfig;
  map: GeneratedMap;
  /** Entity ids per player, in spawn order. */
  eids: number[][];
  rng: Prng;
}

/** Map + spawns for the options; consumes the scenario PRNG (commands continue from `rng`). */
export function buildScenarioWorld(o: ScenarioOptions, data: SimData): ScenarioWorld {
  const rng = createPrng(o.seed ^ 0x5ca1ab1e);
  const map = generateMap(rng, o.mapSide, o.obstaclePct);
  const mobile: string[] = [];
  for (let t = 0; t < data.unitIds.length; t++)
    if ((data.speedFxPerTick[t] as number) > 0) mobile.push(data.unitIds[t] as string);
  if (mobile.length === 0) throw new Error('data has no mobile units');
  const strip = STRIP(o.mapSide);
  const used = new Set<number>();
  const spawns: SpawnSpec[] = [];
  const eids: number[][] = [[], []];
  const perPlayer = Math.trunc(o.units / 2);
  const cap = strip * o.mapSide;
  if (perPlayer > cap) throw new Error('too many units for the spawn strip');
  for (let p = 0; p < 2; p++) {
    for (let k = 0; k < perPlayer; k++) {
      let tx = 0;
      let ty = 0;
      do {
        tx = (p === 0 ? 0 : o.mapSide - strip) + rng.nextInt(strip);
        ty = rng.nextInt(o.mapSide);
      } while (used.has(ty * o.mapSide + tx));
      used.add(ty * o.mapSide + tx);
      spawns.push({
        unit: mobile[spawns.length % mobile.length] as string,
        owner: p,
        x: tileCentreFx(tx),
        y: tileCentreFx(ty),
      });
      eids[p]?.push(makeEid(1, spawns.length - 1));
    }
  }
  const config: SimConfig = {
    maxPlayers: 2,
    maxEntities: Math.max(256, o.units + 16),
    map: { width: o.mapSide, height: o.mapSide, blockedRle: rleEncode(map.blocked) },
    spawns,
  };
  return { config, map, eids, rng };
}

/** Random free tile in the horizontal band [x0, x1). */
export function randomFreeTile(
  rng: Prng,
  map: GeneratedMap,
  side: number,
  x0: number,
  x1: number,
): { tx: number; ty: number } {
  for (let g = 0; g < 1000; g++) {
    const tx = x0 + rng.nextInt(x1 - x0);
    const ty = rng.nextInt(side);
    if (map.blocked[ty * side + tx] === 0) return { tx, ty };
  }
  return { tx: x0, ty: 0 };
}

export function moveCommand(
  turn: number,
  playerId: number,
  unitIds: number[],
  tx: number,
  ty: number,
): Command {
  return {
    turn,
    playerId,
    type: 'move',
    unitIds,
    target: { kind: 'pos', x: tileCentreFx(tx), y: tileCentreFx(ty) },
    payload: null,
  };
}

function stopCommand(turn: number, playerId: number, unitIds: number[]): Command {
  return { turn, playerId, type: 'stop', unitIds, target: null, payload: null };
}

function slice(rng: Prng, ids: readonly number[], max: number): number[] {
  const len = 1 + rng.nextInt(Math.min(max, ids.length));
  const start = rng.nextInt(ids.length - len + 1);
  return ids.slice(start, start + len);
}

/** Generates the replay (commands, finalHash, checkpoints) by running the sim once. */
export function generateScenario(
  o: ScenarioOptions,
  data: SimData,
  dataVersion: string = data.dataVersion,
  simOpts?: SimOptions,
): Scenario {
  const t0 = performance.now();
  const w = buildScenarioWorld(o, data);
  const { rng, map, config } = w;
  const side = o.mapSide;
  const half = Math.trunc(side / 2);
  const turns: Replay['turns'] = [];
  const st: ScenarioStats = {
    units: config.spawns.length,
    commands: 0,
    moveCommands: 0,
    stopCommands: 0,
    pocketCommands: 0,
    unitsMoved: 0,
    blockedPermille: 0,
  };
  for (let i = 0; i < map.blocked.length; i++) st.blockedPermille += map.blocked[i] as number;
  st.blockedPermille = Math.trunc((st.blockedPermille * 1000) / map.blocked.length);

  const cmdsForTurn = (n: number): Command[] => {
    const cmds: Command[] = [];
    if (n === 0) {
      // Everybody gets an initial order toward the opposite half, in groups of <= groupMax.
      for (let p = 0; p < 2; p++) {
        const ids = w.eids[p] as number[];
        for (let a = 0; a < ids.length; a += o.groupMax) {
          const t = randomFreeTile(rng, map, side, p === 0 ? half : 0, p === 0 ? side : half);
          cmds.push(moveCommand(n, p, ids.slice(a, a + o.groupMax), t.tx, t.ty));
        }
      }
    } else if (n % o.cmdEvery === 0) {
      const p = rng.nextInt(2);
      const ids = w.eids[p] as number[];
      const kind = rng.nextInt(10);
      if (kind === 0) cmds.push(stopCommand(n, p, slice(rng, ids, Math.max(1, o.groupMax >> 2))));
      else if (kind === 1 && o.pocketEvery > 0 && rng.nextInt(o.pocketEvery) === 0)
        cmds.push(moveCommand(n, p, slice(rng, ids, o.groupMax), map.pocket.tx, map.pocket.ty));
      else {
        const t = randomFreeTile(rng, map, side, 0, side);
        cmds.push(moveCommand(n, p, slice(rng, ids, o.groupMax), t.tx, t.ty));
      }
    }
    return cmds;
  };

  // Pocket commands are deliberately rare in the random branch; guarantee a few at fixed turns.
  const forcedPocket = new Set<number>();
  for (let k = 1; k <= 3; k++) forcedPocket.add(Math.trunc((o.turns * k) / 4));

  const sim = createSim(o.seed, dataVersion, config, data, simOpts);
  const startTile = new Int32Array(sim.world.highWater);
  for (let i = 0; i < sim.world.highWater; i++)
    startTile[i] =
      fxToTile(sim.world.posY[i] as number) * side + fxToTile(sim.world.posX[i] as number);
  const moved = new Uint8Array(sim.world.highWater);
  const checkpoints: [number, number][] = [];
  for (let n = 0; n < o.turns; n++) {
    const cmds = cmdsForTurn(n);
    if (forcedPocket.has(n)) {
      const p = n & 1;
      cmds.push(
        moveCommand(
          n,
          p,
          slice(rng, w.eids[p] as number[], o.groupMax),
          map.pocket.tx,
          map.pocket.ty,
        ),
      );
    }
    for (const c of cmds) {
      st.commands++;
      if (c.type === 'stop') st.stopCommands++;
      else st.moveCommands++;
      if (
        c.target !== null &&
        fxToTile(c.target.x) === map.pocket.tx &&
        fxToTile(c.target.y) === map.pocket.ty
      )
        st.pocketCommands++;
    }
    if (cmds.length > 0) turns.push({ n, cmds });
    const res = sim.step(cmds);
    if ((n + 1) % o.checkpointEvery === 0) checkpoints.push([n + 1, res.hash]);
    for (let i = 0; i < moved.length; i++) {
      if (moved[i] === 1) continue;
      const t =
        fxToTile(sim.world.posY[i] as number) * side + fxToTile(sim.world.posX[i] as number);
      if (t !== startTile[i]) moved[i] = 1;
    }
  }
  for (let i = 0; i < moved.length; i++) st.unitsMoved += moved[i] as number;
  const replay: Replay = {
    version: REPLAY_FORMAT_VERSION,
    seed: o.seed,
    dataVersion,
    simDataHash: simDataHash(data),
    config,
    totalTurns: o.turns,
    turns,
    finalHash: sim.hashFull(),
    checkpoints,
  };
  return { replay, stats: st, elapsedMs: performance.now() - t0 };
}
