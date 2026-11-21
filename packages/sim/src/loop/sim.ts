// Simulation loop (ADR-005 §8). Fixed system order per tick:
// commands (turn boundary) -> prev snapshot -> grid.flush -> movement.update -> tick++.
import {
  TURN_TICKS,
  createPrng,
  fxToTile,
  validateSimConfig,
  type Command,
  type SimConfig,
  type SimData,
} from '@reinos/shared';
import { applyCommands } from '../commands/index';
import { hashState, hashStateFull, spawn, createWorld, type World } from '../ecs/index';
import { createGridFromMap } from '../grid/map';
import { createMovementSystem } from '../steer/index';
import { type Grid, type GridFactory, type MovementFactory, type MovementSystem } from '../systems';

export interface TurnResult {
  /** Ticks completed after the step. */
  tick: number;
  /** 0-based index of the turn that was just executed. */
  turn: number;
  /** sim.hash() at the end of the turn. */
  hash: number;
  /** Commands of the turn that were rejected whole. */
  rejected: number;
}

export interface Sim {
  readonly world: World;
  readonly grid: Grid;
  /** Ticks completed. */
  readonly tick: number;
  /** trunc(tick / TURN_TICKS): the turn that will execute next. */
  readonly turn: number;
  /** Advances EXACTLY one turn (TURN_TICKS ticks). Requires tick % TURN_TICKS === 0. */
  step(commands: readonly Command[]): TurnResult;
  /** Advances one tick; commands are only allowed on a turn boundary. */
  stepTick(commands?: readonly Command[]): void;
  hash(): number;
  hashFull(): number;
  /** Drops every cache of the movement system (cache-transparency tests). */
  clearCaches(): void;
}

export interface SimOptions {
  /** Defaults to steer/createMovementSystem (the straight-line stub stays available for tests). */
  movement?: MovementFactory;
  /** Defaults to grid/createGridFromMap. */
  grid?: GridFactory;
}

export function createSim(
  seed: number,
  dataVersion: string,
  config: SimConfig,
  data: SimData,
  opts?: SimOptions,
): Sim {
  if (dataVersion !== data.dataVersion)
    throw new Error(
      'dataVersion mismatch: replay/match "' + dataVersion + '" vs data "' + data.dataVersion + '"',
    );
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError('seed must be a uint32');
  const cfg = validateSimConfig(config);

  const grid = (opts?.grid ?? createGridFromMap)(cfg.map);
  const world = createWorld(cfg.maxEntities);
  const prng = createPrng(seed);
  const movement: MovementSystem = (opts?.movement ?? createMovementSystem)(world, grid, data);

  for (let k = 0; k < cfg.spawns.length; k++) {
    const s = cfg.spawns[k];
    if (s === undefined) continue;
    const typeId = data.unitIds.indexOf(s.unit);
    if (typeId < 0) throw new Error('config.spawns[' + k + ']: unknown unit "' + s.unit + '"');
    if (grid.isBlocked(fxToTile(s.x), fxToTile(s.y)))
      throw new Error('config.spawns[' + k + ']: spawn on a blocked or out-of-map tile');
    spawn(world, {
      typeId,
      owner: s.owner,
      x: s.x,
      y: s.y,
      radius: data.radiusFx[typeId] as number,
      hp: data.hpFx[typeId] as number,
    });
  }

  let tick = 0;
  let lastRejected = 0;
  const maxPlayers = cfg.maxPlayers;

  const tickOnce = (commands: readonly Command[] | undefined): void => {
    lastRejected = 0;
    if (tick % TURN_TICKS === 0 && commands !== undefined && commands.length > 0)
      lastRejected = applyCommands(
        world,
        grid,
        movement,
        commands,
        Math.trunc(tick / TURN_TICKS),
        maxPlayers,
      );
    for (let i = 0; i < world.highWater; i++) {
      if (world.alive[i] === 0) continue;
      world.prevX[i] = world.posX[i] as number;
      world.prevY[i] = world.posY[i] as number;
    }
    grid.flush();
    movement.update(tick);
    tick++;
  };

  const sim: Sim = {
    world,
    grid,
    get tick() {
      return tick;
    },
    get turn() {
      return Math.trunc(tick / TURN_TICKS);
    },
    step(commands) {
      if (tick % TURN_TICKS !== 0) throw new RangeError('step requires a turn boundary');
      const turn = Math.trunc(tick / TURN_TICKS);
      tickOnce(commands);
      const rejected = lastRejected;
      for (let k = 1; k < TURN_TICKS; k++) tickOnce(undefined);
      return { tick, turn, hash: sim.hash(), rejected };
    },
    stepTick(commands) {
      if (commands !== undefined && commands.length > 0 && tick % TURN_TICKS !== 0)
        throw new RangeError('commands are only allowed on a turn boundary');
      tickOnce(commands);
    },
    hash() {
      return hashState(world, tick, grid.version, prng.getState());
    },
    hashFull() {
      return hashStateFull(world, tick, grid, prng.getState());
    },
    clearCaches() {
      movement.clearCaches();
    },
  };
  return sim;
}
