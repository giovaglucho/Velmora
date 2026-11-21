import {
  createPrng,
  type Command,
  type SimConfig,
  type SimData,
  type SpawnSpec,
} from '@reinos/shared';

/** Hand-made integer SimData (sim cannot import @reinos/data). Independent of balance values. */
export const TEST_DATA: SimData = {
  dataVersion: 'test-1',
  unitIds: ['colono', 'recluta', 'jinete'],
  speedFxPerTick: [40, 45, 70],
  radiusFx: [250, 300, 450],
  hpFx: [25_000, 40_000, 100_000],
  movement: {
    pathBudgetPerTick: 16,
    arriveDistFx: 100,
    groupArriveDistFx: 1500,
    stuckTicks: 20,
    repathCooldownTicks: 10,
    separationPermille: 700,
    neighborRangeFx: 400,
    minProgressPermille: 250,
  },
};

/** RLE (free-first alternating runs) for a width x height map with the given blocked tiles. */
export function rleFromBlocked(
  width: number,
  height: number,
  blocked: ReadonlySet<number>,
): number[] {
  const runs: number[] = [];
  let cur = 0; // 0 = free
  let len = 0;
  for (let i = 0; i < width * height; i++) {
    const b = blocked.has(i) ? 1 : 0;
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

export function makeConfig(
  opts: {
    width?: number;
    height?: number;
    blockedTiles?: [number, number][];
    maxPlayers?: number;
    maxEntities?: number;
    spawns?: SpawnSpec[];
  } = {},
): SimConfig {
  const width = opts.width ?? 16;
  const height = opts.height ?? 16;
  const blocked = new Set<number>();
  for (const [x, y] of opts.blockedTiles ?? []) blocked.add(y * width + x);
  return {
    maxPlayers: opts.maxPlayers ?? 2,
    maxEntities: opts.maxEntities ?? 256,
    map: { width, height, blockedRle: rleFromBlocked(width, height, blocked) },
    spawns: opts.spawns ?? [],
  };
}

export const spawnAt = (unit: string, owner: number, tx: number, ty: number): SpawnSpec => ({
  unit,
  owner,
  x: tx * 1000 + 500,
  y: ty * 1000 + 500,
});

export function moveCmd(
  turn: number,
  playerId: number,
  unitIds: number[],
  x: number,
  y: number,
): Command {
  return { turn, playerId, type: 'move', unitIds, target: { kind: 'pos', x, y }, payload: null };
}
export function stopCmd(turn: number, playerId: number, unitIds: number[]): Command {
  return { turn, playerId, type: 'stop', unitIds, target: null, payload: null };
}

/** First eid of a world that spawns n units in order: slot k, generation 1. */
export const eidOf = (slot: number, gen = 1): number => ((gen << 16) | slot) >>> 0;

export { createPrng };
