import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import {
  MAX_WAYPOINTS,
  ORDER_MOVE,
  ORDER_NONE,
  PATH_FOLLOW,
  createMovementSystemWith,
  createWorld,
  hashStateFull,
  spawn,
  type GridImpl,
  type MovementOptions,
  type World,
} from '../src/index';
import { TEST_DATA } from './helpers/fixtures';
import { gridFromAscii, randomGrid } from './helpers/maps';

interface Rig {
  grid: GridImpl;
  world: World;
  tick: number;
  step(): void;
  order(i: number, wps: [number, number][]): void;
  hash(): number;
}

function rig(grid: GridImpl, cap: number, opts?: MovementOptions): Rig {
  const world = createWorld(cap);
  const sys = createMovementSystemWith(world, grid, TEST_DATA, opts);
  const r: Rig = {
    grid,
    world,
    tick: 0,
    step() {
      for (let i = 0; i < world.highWater; i++) {
        world.prevX[i] = world.posX[i] as number;
        world.prevY[i] = world.posY[i] as number;
      }
      grid.flush();
      sys.update(r.tick++);
    },
    order(i, wps) {
      world.orderKind[i] = ORDER_MOVE;
      world.pathState[i] = PATH_FOLLOW;
      const last = wps[wps.length - 1]!;
      world.goalX[i] = last[0];
      world.goalY[i] = last[1];
      world.pathCount[i] = wps.length;
      world.pathIdx[i] = 0;
      world.stuck[i] = 0;
      for (let k = 0; k < wps.length; k++) {
        world.wpX[i * MAX_WAYPOINTS + k] = wps[k]![0];
        world.wpY[i * MAX_WAYPOINTS + k] = wps[k]![1];
      }
    },
    hash() {
      return hashStateFull(world, r.tick, grid, [0, 0, 0, 0]);
    },
  };
  return r;
}

function spawnRandom(r: Rig, n: number, rng: ReturnType<typeof createPrng>): void {
  for (let k = 0; k < n; k++) {
    let tx = 0;
    let ty = 0;
    do {
      tx = rng.nextInt(r.grid.width);
      ty = rng.nextInt(r.grid.height);
    } while (r.grid.isBlocked(tx, ty));
    const type = rng.nextInt(3);
    spawn(r.world, {
      typeId: type,
      owner: 0,
      x: tx * 1000 + 500,
      y: ty * 1000 + 500,
      radius: TEST_DATA.radiusFx[type]!,
      hp: 1,
    });
  }
}

function worstOverlap(w: World): number {
  // returns max overlap as a fraction (permille) of the smaller radius
  let worst = 0;
  for (let i = 0; i < w.highWater; i++)
    for (let j = i + 1; j < w.highWater; j++) {
      const dx = (w.posX[i] as number) - (w.posX[j] as number);
      const dy = (w.posY[i] as number) - (w.posY[j] as number);
      const d = Math.sqrt(dx * dx + dy * dy);
      const o = (w.radius[i] as number) + (w.radius[j] as number) - d;
      if (o > 0)
        worst = Math.max(
          worst,
          (o * 1000) / Math.min(w.radius[i] as number, w.radius[j] as number),
        );
    }
  return worst;
}

describe('steering: invariantes', () => {
  it('ninguna unidad ocupa una casilla bloqueada, en cada tick (200 unidades x 10^4 ticks)', () => {
    const grid = randomGrid(64, 64, 4, 25);
    const r = rig(grid, 256);
    const rng = createPrng(11);
    spawnRandom(r, 200, rng);
    for (let t = 0; t < 10_000; t++) {
      if (t % 40 === 0)
        for (let k = 0; k < 20; k++) {
          // straight-line orders that ignore walls on purpose: sliding must keep units legal
          const i = rng.nextInt(200);
          r.order(i, [[rng.nextInt(64000), rng.nextInt(64000)]]);
        }
      r.step();
      for (let i = 0; i < 200; i++) {
        const x = r.world.posX[i] as number;
        const y = r.world.posY[i] as number;
        if (x < 0 || y < 0 || grid.isBlocked(Math.floor(x / 1000), Math.floor(y / 1000)))
          throw new Error('unit ' + i + ' on a blocked tile at tick ' + t + ' pos ' + x + ',' + y);
      }
    }
  });

  it('tras reposar 100 ticks no hay pares con solape > 50% del menor radio', () => {
    const grid = randomGrid(40, 40, 8, 10);
    const r = rig(grid, 256);
    const rng = createPrng(5);
    spawnRandom(r, 200, rng);
    for (let t = 0; t < 600; t++) {
      if (t % 60 === 0)
        for (let i = 0; i < 200; i++)
          r.order(i, [[20000 + rng.nextInt(4000), 20000 + rng.nextInt(4000)]]);
      r.step();
    }
    // free the orders (stop) and rest
    for (let i = 0; i < 200; i++) {
      r.world.orderKind[i] = ORDER_NONE;
      r.world.pathState[i] = 0;
    }
    for (let t = 0; t < 100; t++) r.step();
    expect(worstOverlap(r.world)).toBeLessThanOrEqual(500);
    for (let i = 0; i < 200; i++) {
      const x = r.world.posX[i] as number;
      const y = r.world.posY[i] as number;
      expect(grid.isBlocked(Math.floor(x / 1000), Math.floor(y / 1000))).toBe(false);
    }
  });

  it('Jacobi: visitar las unidades en orden inverso da el mismo hashFull', () => {
    const run = (reverse: boolean): number => {
      const grid = randomGrid(48, 48, 21, 20);
      const r = rig(grid, 256, { reverseOrder: reverse });
      const rng = createPrng(77);
      spawnRandom(r, 150, rng);
      for (let t = 0; t < 1500; t++) {
        if (t % 50 === 0)
          for (let k = 0; k < 30; k++) {
            const i = rng.nextInt(150);
            r.order(i, [[rng.nextInt(48000), rng.nextInt(48000)]]);
          }
        r.step();
      }
      return r.hash();
    };
    expect(run(true)).toBe(run(false));
  });

  it('100 unidades cruzan un pasillo de 3 casillas (>= 95% llegan) en <= T ticks', () => {
    // 30x13 map: left chamber (x<8), corridor 3 wide (x 8..21), right chamber (x>=22)
    const rows: string[] = [];
    for (let y = 0; y < 13; y++) {
      let row = '';
      for (let x = 0; x < 30; x++) row += x >= 8 && x < 22 && (y < 5 || y > 7) ? '#' : '.';
      rows.push(row);
    }
    const grid = gridFromAscii(rows);
    const r = rig(grid, 128);
    // 100 units on the left, 4 per column-ish, speed mix from TEST_DATA
    for (let k = 0; k < 100; k++)
      spawn(r.world, {
        typeId: k % 3,
        owner: 0,
        x: (k % 8) * 1000 + 500,
        y: Math.floor(k / 8) * 1000 + 500,
        radius: TEST_DATA.radiusFx[k % 3]!,
        hp: 1,
      });
    for (let k = 0; k < 100; k++)
      r.order(k, [
        [8500, 6500],
        [21500, 6500],
        [26500, 3000 + (k % 7) * 1000],
      ]);
    // T: crossing 21 tiles at the slowest speed (40/tick = 0.04 tile) is 525 ticks; ~100 units in a
    // 3-wide lane (about 4 abreast, 25 ranks, ~1 tile per rank at 0.04 tile/tick) adds ~650 ticks
    // (measured: 95 units done at tick ~1180). T = 2500 is a >2x margin for the group-arrival waits.
    const T = 2500;
    let done = 0;
    let t = 0;
    for (; t < T; t++) {
      r.step();
      done = 0;
      for (let k = 0; k < 100; k++) if (r.world.orderKind[k] === ORDER_NONE) done++;
      if (done >= 95) break;
    }
    console.log('corridor: done', done, 'of 100 at tick', t);
    expect(done).toBeGreaterThanOrEqual(95);
  });
});
