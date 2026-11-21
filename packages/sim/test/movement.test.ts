import { describe, expect, it } from 'vitest';
import {
  TURN_TICKS,
  createPrng,
  type Command,
  type SimConfig,
  type SpawnSpec,
} from '@reinos/shared';
import {
  ORDER_MOVE,
  ORDER_NONE,
  PATH_FAILED,
  createMovementSystemWith,
  createSim,
  type MovementFactory,
  type MovementSystemImpl,
  type Sim,
} from '../src/index';
import { TEST_DATA, eidOf, moveCmd, rleFromBlocked } from './helpers/fixtures';

const UNITS = TEST_DATA.unitIds;

function obstacleMap(
  w: number,
  h: number,
  seed: number,
  blocks: number,
  keepFree: (x: number, y: number) => boolean = () => false,
): Set<number> {
  const rng = createPrng(seed);
  const blocked = new Set<number>();
  for (let k = 0; k < blocks; k++) {
    const bx = rng.nextInt(w - 4);
    const by = rng.nextInt(h - 4);
    const bw = 1 + rng.nextInt(4);
    const bh = 1 + rng.nextInt(4);
    for (let y = by; y < by + bh; y++)
      for (let x = bx; x < bx + bw; x++) if (!keepFree(x, y)) blocked.add(y * w + x);
  }
  return blocked;
}

function freeSpawns(
  w: number,
  h: number,
  blocked: Set<number>,
  n: number,
  seed: number,
  region: (x: number, y: number) => boolean,
): SpawnSpec[] {
  const rng = createPrng(seed);
  const cells: number[] = [];
  for (let i = 0; i < w * h; i++)
    if (!blocked.has(i) && region(i % w, Math.floor(i / w))) cells.push(i);
  const out: SpawnSpec[] = [];
  for (let k = 0; k < n; k++) {
    const cell = cells[rng.nextInt(cells.length)]!;
    out.push({
      unit: UNITS[rng.nextInt(UNITS.length)]!,
      owner: 0,
      x: (cell % w) * 1000 + 500,
      y: Math.floor(cell / w) * 1000 + 500,
    });
  }
  return out;
}

function capture(): { factory: MovementFactory; get: () => MovementSystemImpl } {
  let sys: MovementSystemImpl | null = null;
  return {
    factory: (w, g, d) => (sys = createMovementSystemWith(w, g, d)),
    get: () => sys!,
  };
}

function makeSim(config: SimConfig, seed = 1, factory?: MovementFactory): Sim {
  return createSim(seed, 'test-1', config, TEST_DATA, factory ? { movement: factory } : undefined);
}

const countDone = (sim: Sim, n: number): number => {
  let d = 0;
  for (let i = 0; i < n; i++) if (sim.world.orderKind[i] === ORDER_NONE) d++;
  return d;
};

function worstOverlapPermille(sim: Sim, n: number): number {
  const w = sim.world;
  let worst = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const dx = (w.posX[i] as number) - (w.posX[j] as number);
      const dy = (w.posY[i] as number) - (w.posY[j] as number);
      const o = (w.radius[i] as number) + (w.radius[j] as number) - Math.sqrt(dx * dx + dy * dy);
      if (o > 0)
        worst = Math.max(
          worst,
          (o * 1000) / Math.min(w.radius[i] as number, w.radius[j] as number),
        );
    }
  return worst;
}

const allOwned = (n: number): number[] => Array.from({ length: n }, (_, k) => eidOf(k));

describe('movimiento real sobre createSim', () => {
  it('400 unidades cruzan a la otra mitad de un mapa con obstáculos (>= 95% terminan la orden)', () => {
    const W = 96;
    const H = 64;
    const blocked = obstacleMap(W, H, 12, 140);
    const N = 400;
    const spawns = freeSpawns(W, H, blocked, N, 3, (x) => x < 24);
    const config: SimConfig = {
      maxPlayers: 1,
      maxEntities: 512,
      map: { width: W, height: H, blockedRle: rleFromBlocked(W, H, blocked) },
      spawns,
    };
    const cap = capture();
    const sim = makeSim(config, 9, cap.factory);
    // goals spread over a block of the right half (free tiles)
    const rng = createPrng(8);
    const goalCells: number[] = [];
    for (let i = 0; i < W * H; i++)
      if (!blocked.has(i) && i % W >= 70 && i % W < 90) goalCells.push(i);
    const cmds: Command[] = [];
    for (let g = 0; g < 8; g++) {
      const cell = goalCells[rng.nextInt(goalCells.length)]!;
      const ids = allOwned(N).filter((_, k) => k % 8 === g);
      cmds.push(moveCmd(0, 0, ids, (cell % W) * 1000 + 500, Math.floor(cell / W) * 1000 + 500));
    }
    // N_TICKS: the farthest unit walks ~80 tiles at the slowest speed (0.04 tile/tick) = 2000
    // ticks plus detours; measured: all 400 finish at tick 2964. 4000 leaves ~35% margin for
    // queueing (16 paths/tick => 25 ticks) and crowd arrival.
    const N_TICKS = 4000;
    let maxResolved = 0;
    let done = 0;
    for (let t = 0; t < N_TICKS / TURN_TICKS; t++) {
      sim.step(t === 0 ? cmds : []);
      maxResolved = Math.max(maxResolved, cap.get().lastResolved);
      done = countDone(sim, N);
      if (done === N) break;
    }
    console.log(
      'cross-map: done',
      done,
      'of',
      N,
      'at tick',
      sim.tick,
      'overlap permille',
      worstOverlapPermille(sim, N).toFixed(0),
    );
    expect(done).toBeGreaterThanOrEqual(Math.ceil(N * 0.95));
    expect(maxResolved).toBeLessThanOrEqual(TEST_DATA.movement.pathBudgetPerTick);
    for (let i = 0; i < N; i++) {
      const tx = Math.floor((sim.world.posX[i] as number) / 1000);
      const ty = Math.floor((sim.world.posY[i] as number) / 1000);
      expect(blocked.has(ty * W + tx)).toBe(false);
    }
  });

  it('400 unidades convergen a un punto sin trabarse: llegan o quedan dentro del radio de la multitud', () => {
    const W = 64;
    const H = 64;
    const blocked = obstacleMap(
      W,
      H,
      5,
      40,
      (x, y) => Math.abs(x - 32) < 10 && Math.abs(y - 32) < 10,
    );
    const N = 400;
    const spawns = freeSpawns(
      W,
      H,
      blocked,
      N,
      4,
      (x, y) => Math.abs(x - 32) > 18 || Math.abs(y - 32) > 18,
    );
    const config: SimConfig = {
      maxPlayers: 1,
      maxEntities: 512,
      map: { width: W, height: H, blockedRle: rleFromBlocked(W, H, blocked) },
      spawns,
    };
    const sim = makeSim(config, 2);
    const goal = { x: 32500, y: 32500 };
    sim.step([moveCmd(0, 0, allOwned(N), goal.x, goal.y)]);
    // crowd radius: all unit discs (r^2 summed) at ~50% packing density, plus the group-arrival
    // distance and a 2-tile margin; computed in the test (floats allowed here).
    let area = 0;
    for (let i = 0; i < N; i++) area += (sim.world.radius[i] as number) ** 2;
    const crowdR = Math.sqrt(area / 0.5) + TEST_DATA.movement.groupArriveDistFx + 2000;
    // N_TICKS: measured 924 ticks for all 400 (the farthest spawn is ~45 tiles away, 1100 ticks
    // at the slowest speed, ring-by-ring settling adds ~20 ticks per ring); 2000 is a >2x margin.
    const N_TICKS = 2000;
    let t = 0;
    let done = 0;
    for (; t < N_TICKS; t += TURN_TICKS) {
      sim.step([]);
      done = countDone(sim, N);
      if (done === N) break;
    }
    let farthest = 0;
    let stuckCount = 0;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(
        (sim.world.posX[i] as number) - goal.x,
        (sim.world.posY[i] as number) - goal.y,
      );
      farthest = Math.max(farthest, d);
      if (
        sim.world.orderKind[i] === ORDER_MOVE &&
        (sim.world.stuck[i] as number) >= TEST_DATA.movement.stuckTicks
      )
        stuckCount++;
    }
    console.log(
      'convergence: done',
      done,
      'of',
      N,
      'at tick',
      sim.tick,
      'farthest',
      farthest.toFixed(0),
      'crowdR',
      crowdR.toFixed(0),
      'overlap permille',
      worstOverlapPermille(sim, N).toFixed(0),
    );
    expect(done).toBeGreaterThanOrEqual(Math.ceil(N * 0.95));
    expect(farthest).toBeLessThanOrEqual(crowdR);
    expect(stuckCount).toBe(0);
  });

  it('sin solapamientos persistentes tras reposar 100 ticks', () => {
    const W = 48;
    const H = 48;
    const blocked = obstacleMap(W, H, 31, 25);
    const N = 300;
    const config: SimConfig = {
      maxPlayers: 1,
      maxEntities: 512,
      map: { width: W, height: H, blockedRle: rleFromBlocked(W, H, blocked) },
      spawns: freeSpawns(W, H, blocked, N, 6, () => true),
    };
    const sim = makeSim(config, 4);
    sim.step([moveCmd(0, 0, allOwned(N), 24500, 24500)]);
    while (sim.tick < 3000 && countDone(sim, N) < N) sim.step([]);
    const orderless = (): number => {
      let c = 0;
      for (let i = 0; i < N; i++) if (sim.world.orderKind[i] === ORDER_MOVE) c++;
      return c;
    };
    // stop whoever is still walking, then rest
    const stillWalking = allOwned(N).filter((_, i) => sim.world.orderKind[i] === ORDER_MOVE);
    if (stillWalking.length > 0)
      sim.step([
        {
          turn: sim.turn,
          playerId: 0,
          type: 'stop',
          unitIds: stillWalking,
          target: null,
          payload: null,
        },
      ]);
    expect(orderless()).toBe(0);
    for (let t = 0; t < 100 / TURN_TICKS; t++) sim.step([]);
    const worst = worstOverlapPermille(sim, N);
    console.log('rest overlap permille', worst.toFixed(0));
    expect(worst).toBeLessThanOrEqual(500);
  });

  it('meta inalcanzable: las unidades terminan en la casilla alcanzable más cercana', () => {
    // vertical wall splits the map; the goal is on the other side
    const W = 30;
    const H = 12;
    const blocked = new Set<number>();
    for (let y = 0; y < H; y++) blocked.add(y * W + 15);
    const spawns: SpawnSpec[] = [];
    for (let k = 0; k < 6; k++)
      spawns.push({ unit: 'recluta', owner: 0, x: 2500 + k * 1000, y: 3500 });
    const config: SimConfig = {
      maxPlayers: 1,
      maxEntities: 32,
      map: { width: W, height: H, blockedRle: rleFromBlocked(W, H, blocked) },
      spawns,
    };
    const sim = makeSim(config);
    sim.step([moveCmd(0, 0, allOwned(6), 25500, 3500)]);
    for (let t = 0; t < 400 && countDone(sim, 6) < 6; t++) sim.step([]);
    expect(countDone(sim, 6)).toBe(6);
    for (let i = 0; i < 6; i++) {
      // closest reachable tile is column 14 on the goal's row; units crowd around it
      const d = Math.hypot(
        (sim.world.posX[i] as number) - 14500,
        (sim.world.posY[i] as number) - 3500,
      );
      expect(d).toBeLessThanOrEqual(3500);
      expect(sim.world.posX[i]).toBeLessThan(15000);
    }
  });

  it('inicio aislado (PATH_NONE): la orden falla (PATH_FAILED) sin quedar en cola', () => {
    const rows = new Set<number>();
    const W = 7;
    // a closed 1-tile cell at (3,3)
    for (const [x, y] of [
      [2, 2],
      [3, 2],
      [4, 2],
      [2, 3],
      [4, 3],
      [2, 4],
      [3, 4],
      [4, 4],
    ] as const)
      rows.add(y * W + x);
    const config: SimConfig = {
      maxPlayers: 1,
      maxEntities: 8,
      map: { width: W, height: W, blockedRle: rleFromBlocked(W, W, rows) },
      spawns: [{ unit: 'recluta', owner: 0, x: 3500, y: 3500 }],
    };
    const sim = makeSim(config);
    sim.step([moveCmd(0, 0, [eidOf(0)], 500, 500)]);
    expect(sim.world.orderKind[0]).toBe(ORDER_NONE);
    expect(sim.world.pathState[0]).toBe(PATH_FAILED);
  });
});

describe('cachés y determinismo del movimiento real', () => {
  const build = (): { config: SimConfig; cmds: Map<number, Command[]>; n: number } => {
    const W = 120;
    const H = 90;
    const blocked = obstacleMap(W, H, 77, 220);
    const n = 1000;
    const spawns = freeSpawns(W, H, blocked, n, 55, () => true);
    const rng = createPrng(1);
    const cmds = new Map<number, Command[]>();
    for (let t = 0; t < 150; t += 7) {
      let tx = 0;
      let ty = 0;
      do {
        tx = rng.nextInt(W);
        ty = rng.nextInt(H);
      } while (blocked.has(ty * W + tx));
      const ids = allOwned(n).filter(() => rng.nextInt(3) === 0);
      if (ids.length > 0) cmds.set(t, [moveCmd(t, 0, ids, tx * 1000 + 500, ty * 1000 + 500)]);
    }
    return {
      config: {
        maxPlayers: 1,
        maxEntities: 1024,
        map: { width: W, height: H, blockedRle: rleFromBlocked(W, H, blocked) },
        spawns,
      },
      cmds,
      n,
    };
  };

  it('clearCaches a mitad de partida no cambia el hashFull final', () => {
    const { config, cmds } = build();
    const run = (clear: boolean): number => {
      const sim = makeSim(config, 5);
      for (let t = 0; t < 200; t++) {
        if (clear && t % 9 === 4) sim.clearCaches();
        sim.step(cmds.get(t) ?? []);
      }
      return sim.hashFull();
    };
    expect(run(true)).toBe(run(false));
  });

  it('dos ejecuciones dan el mismo hashFull (1000 unidades, 1000 ticks)', () => {
    const { config, cmds } = build();
    const run = (): number => {
      const sim = makeSim(config, 6);
      for (let t = 0; t < 250; t++) sim.step(cmds.get(t) ?? []);
      expect(sim.tick).toBe(1000);
      return sim.hashFull();
    };
    expect(run()).toBe(run());
  });
});
