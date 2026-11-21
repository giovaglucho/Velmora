import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import {
  HASHED_COLUMNS,
  HASHED_SCALARS,
  MAX_WAYPOINTS,
  UNHASHED_COLUMNS,
  createWorld,
  despawn,
  eidGen,
  eidIndex,
  hashState,
  hashStateFull,
  isAlive,
  makeEid,
  spawn,
  type SpawnInit,
  type World,
} from '../src/index';

const init = (n: number, over: Partial<SpawnInit> = {}): SpawnInit => ({
  typeId: n % 3,
  owner: n % 2,
  x: 1000 * n + 500,
  y: 2000 * n + 500,
  radius: 300,
  hp: 40_000,
  ...over,
});
const NO_PRNG: [number, number, number, number] = [0, 0, 0, 0];
const EMPTY_GRID = { version: 0, terrain: new Uint8Array(4), occ: new Uint8Array(4) };

/** Every typed column of a slot, for "all zero" checks. */
function slotColumns(w: World, i: number): number[] {
  const out: number[] = [];
  for (const k of Object.keys(w) as (keyof World)[]) {
    const v = w[k];
    if (!ArrayBuffer.isView(v)) continue;
    if (k === 'wpX' || k === 'wpY') {
      const a = v as Int32Array;
      for (let j = 0; j < MAX_WAYPOINTS; j++) out.push(a[i * MAX_WAYPOINTS + j] as number);
    } else if (k === 'freeSlots' || k === 'gen') continue;
    else out.push((v as unknown as number[])[i] as number);
  }
  return out;
}

describe('eids', () => {
  it('pack (gen << 16) | idx', () => {
    expect(makeEid(1, 0)).toBe(65536);
    expect(makeEid(1, 5)).toBe(65541);
    expect(makeEid(32767, 65534)).toBe(0x7ffffffe);
    expect(eidIndex(0x7ffffffe)).toBe(65534);
    expect(eidGen(0x7ffffffe)).toBe(32767);
    expect(makeEid(0, 0)).toBe(0); // NONE
  });
});

describe('spawn / despawn', () => {
  it('first spawns take fresh slots 0,1,2.. with generation 1', () => {
    const w = createWorld(8);
    const ids = [0, 1, 2].map((n) => spawn(w, init(n)));
    expect(ids).toEqual([65536, 65537, 65538]);
    expect(w.count).toBe(3);
    expect(w.highWater).toBe(3);
    expect(isAlive(w, ids[1]!)).toBe(true);
    expect(w.posX[1]).toBe(1500);
    expect(w.prevX[1]).toBe(1500);
    expect(w.prevY[1]).toBe(2500);
    expect(w.hp[2]).toBe(40_000);
    expect(w.radius[0]).toBe(300);
    expect(w.orderKind[0]).toBe(0);
    expect(w.pathState[0]).toBe(0);
  });
  it('identical spawn/despawn sequences produce identical eids and state in two worlds', () => {
    const run = () => {
      const w = createWorld(16);
      const log: number[] = [];
      const ids: number[] = [];
      for (let i = 0; i < 10; i++) ids.push(spawn(w, init(i)));
      for (const k of [3, 7, 1, 5]) log.push(despawn(w, ids[k]!) ? 1 : 0);
      for (let i = 10; i < 16; i++) ids.push(spawn(w, init(i)));
      return { ids, log, hash: hashStateFull(w, 5, EMPTY_GRID, NO_PRNG), w };
    };
    const a = run();
    const b = run();
    expect(a.ids).toEqual(b.ids);
    expect(a.log).toEqual([1, 1, 1, 1]);
    expect(a.hash).toBe(b.hash);
    expect(a.w.freeTop).toBe(b.w.freeTop);
    expect(Array.from(a.w.alive)).toEqual(Array.from(b.w.alive));
  });
  it('reuses freed slots LIFO and bumps the generation', () => {
    const w = createWorld(8);
    const ids = [0, 1, 2, 3].map((n) => spawn(w, init(n)));
    despawn(w, ids[1]!);
    despawn(w, ids[3]!);
    const a = spawn(w, init(9)); // top of the stack = slot 3
    const b = spawn(w, init(10)); // then slot 1
    const c = spawn(w, init(11)); // stack empty -> fresh slot 4
    expect(eidIndex(a)).toBe(3);
    expect(eidIndex(b)).toBe(1);
    expect(eidIndex(c)).toBe(4);
    expect(eidGen(a)).toBe(2);
    expect(eidGen(b)).toBe(2);
    expect(eidGen(c)).toBe(1);
    expect(w.highWater).toBe(5);
    expect(w.count).toBe(5);
  });
  it('stale eids are not alive and despawn returns false', () => {
    const w = createWorld(4);
    const e = spawn(w, init(0));
    expect(despawn(w, e)).toBe(true);
    expect(isAlive(w, e)).toBe(false);
    expect(despawn(w, e)).toBe(false);
    const e2 = spawn(w, init(1)); // same slot, new generation
    expect(eidIndex(e2)).toBe(eidIndex(e));
    expect(e2).not.toBe(e);
    expect(isAlive(w, e)).toBe(false);
    expect(despawn(w, e)).toBe(false);
    expect(isAlive(w, e2)).toBe(true);
    expect(w.count).toBe(1);
  });
  it('rejects garbage eids without throwing', () => {
    const w = createWorld(4);
    spawn(w, init(0));
    for (const e of [0, -1, 1.5, NaN, 2 ** 40, 65535, 0xffff0000 | 0, 65536 + 3, 3 * 65536])
      expect(isAlive(w, e)).toBe(false);
    expect(despawn(w, 0)).toBe(false);
  });
  it('generation wraps from 32767 to 1 (never 0)', () => {
    const w = createWorld(2);
    let e = spawn(w, init(0));
    expect(eidGen(e)).toBe(1);
    for (let g = 1; g <= 32767; g++) {
      expect(eidGen(e)).toBe(g);
      expect(despawn(w, e)).toBe(true);
      e = spawn(w, init(0));
    }
    expect(eidGen(e)).toBe(1); // wrapped
    expect(w.gen[0]).toBe(1);
    expect(isAlive(w, e)).toBe(true);
  });
  it('despawn zeroes every column of the slot, including waypoints', () => {
    const w = createWorld(3);
    const e = spawn(w, init(1));
    const i = eidIndex(e);
    w.velX[i] = -5;
    w.velY[i] = 9;
    w.facing[i] = 300;
    w.orderKind[i] = 1;
    w.goalX[i] = 7;
    w.goalY[i] = 8;
    w.pathState[i] = 2;
    w.pathCount[i] = 3;
    w.pathIdx[i] = 1;
    w.stuck[i] = 4;
    w.repathAt[i] = 99;
    for (let k = 0; k < MAX_WAYPOINTS; k++) {
      w.wpX[i * MAX_WAYPOINTS + k] = k + 1;
      w.wpY[i * MAX_WAYPOINTS + k] = -k - 1;
    }
    despawn(w, e);
    expect(w.alive[i]).toBe(0);
    expect(slotColumns(w, i).every((v) => v === 0)).toBe(true);
    expect(w.gen[i]).toBe(2);
  });
  it('a reused slot starts clean (no leftovers from the previous tenant)', () => {
    const w = createWorld(2);
    const e = spawn(w, init(1));
    const i = eidIndex(e);
    w.pathCount[i] = 5;
    w.wpX[i * MAX_WAYPOINTS] = 77;
    w.repathAt[i] = 5;
    despawn(w, e);
    const e2 = spawn(w, init(2));
    expect(eidIndex(e2)).toBe(i);
    expect(w.pathCount[i]).toBe(0);
    expect(w.wpX[i * MAX_WAYPOINTS]).toBe(0);
    expect(w.repathAt[i]).toBe(0);
    expect(w.velX[i]).toBe(0);
  });
  it('capacity exhausted -> RangeError("entity capacity"); freeing makes room again', () => {
    const w = createWorld(3);
    const ids = [0, 1, 2].map((n) => spawn(w, init(n)));
    expect(() => spawn(w, init(3))).toThrow(RangeError);
    expect(() => spawn(w, init(3))).toThrow('entity capacity');
    expect(w.count).toBe(3);
    despawn(w, ids[0]!);
    expect(() => spawn(w, init(3))).not.toThrow();
  });
  it('createWorld validates capacity', () => {
    for (const c of [0, -1, 1.5, 65536]) expect(() => createWorld(c)).toThrow(RangeError);
    expect(() => createWorld(65535)).not.toThrow();
  });
});

describe('iteration order', () => {
  it('the canonical loop visits live slots in ascending order, skipping dead ones', () => {
    const w = createWorld(16);
    const ids = Array.from({ length: 12 }, (_, n) => spawn(w, init(n)));
    for (const k of [10, 2, 7, 0]) despawn(w, ids[k]!);
    spawn(w, init(50)); // reuses slot 0
    const seen: number[] = [];
    for (let i = 0; i < w.highWater; i++) {
      if (w.alive[i] === 0) continue;
      seen.push(i);
      expect(isAlive(w, makeEid(w.gen[i] as number, i))).toBe(true);
    }
    expect(seen).toEqual([0, 1, 3, 4, 5, 6, 8, 9, 11]);
    expect(seen.length).toBe(w.count);
  });
});

describe('column registry completeness', () => {
  const lists = [...HASHED_COLUMNS, ...HASHED_SCALARS, ...UNHASHED_COLUMNS] as string[];
  it('every field of World is in exactly one list', () => {
    const w = createWorld(2);
    const keys = Object.keys(w).sort();
    expect([...lists].sort()).toEqual(keys); // same set, no key missing or extra
    expect(new Set(lists).size).toBe(lists.length); // none listed twice
  });
  it('hashed columns exist and are typed arrays', () => {
    const w = createWorld(2);
    for (const c of HASHED_COLUMNS) expect(ArrayBuffer.isView(w[c])).toBe(true);
  });
  it('hash order is the ADR-005 §4 order', () => {
    expect([...HASHED_COLUMNS]).toEqual([
      'typeId',
      'owner',
      'posX',
      'posY',
      'velX',
      'velY',
      'facing',
      'hp',
      'orderKind',
      'goalX',
      'goalY',
      'pathState',
      'pathIdx',
      'stuck',
    ]);
  });
});

describe('hash()', () => {
  /** The fixed 5-entity world of test/reference/ecs_hash_reference.py. */
  function referenceWorld(): World {
    const w = createWorld(8);
    const e = [
      spawn(w, { typeId: 1, owner: 0, x: 1500, y: 2500, radius: 300, hp: 40000 }),
      spawn(w, { typeId: 0, owner: 1, x: 3500, y: 500, radius: 250, hp: 25000 }),
      spawn(w, { typeId: 0, owner: 255, x: 0, y: 0, radius: 250, hp: 25000 }),
      spawn(w, { typeId: 1, owner: 1, x: 7500, y: 7500, radius: 300, hp: 40000 }),
      spawn(w, { typeId: 2, owner: 0, x: 512000, y: 512000, radius: 450, hp: -5 }),
    ];
    despawn(w, e[3]!);
    despawn(w, e[1]!); // stack [3, 1]: next spawn takes slot 1 with generation 2
    spawn(w, { typeId: 2, owner: 1, x: 4500, y: 4500, radius: 450, hp: 100000 });
    w.velX[0] = -12;
    w.velY[0] = 7;
    w.facing[0] = 900;
    w.orderKind[0] = 1;
    w.goalX[0] = 9500;
    w.goalY[0] = 8500;
    w.pathState[0] = 2;
    w.pathIdx[0] = 1;
    w.stuck[0] = 3;
    w.facing[1] = 5;
    w.velX[4] = -2147483648;
    w.facing[4] = 1023;
    w.orderKind[4] = 1;
    w.goalY[4] = 2147483647;
    w.pathState[4] = 4;
    w.stuck[4] = 65535;
    return w;
  }

  it('matches the golden vector from the independent Python reference', () => {
    const w = referenceWorld();
    expect(w.count).toBe(4);
    expect(hashState(w, 123, 7, [1, 2, 3, 4])).toBe(197909110); // 0x0bcbda76
  });
  it('depends on tick, grid version, every prng word and the entity count', () => {
    const w = referenceWorld();
    const base = hashState(w, 123, 7, [1, 2, 3, 4]);
    expect(hashState(w, 124, 7, [1, 2, 3, 4])).not.toBe(base);
    expect(hashState(w, 123, 8, [1, 2, 3, 4])).not.toBe(base);
    for (let k = 0; k < 4; k++) {
      const p: [number, number, number, number] = [1, 2, 3, 4];
      p[k]! += 1;
      expect(hashState(w, 123, 7, p)).not.toBe(base);
    }
  });
  it('is sensitive to each hashed column and blind to unhashed ones', () => {
    const base = (() => hashState(referenceWorld(), 1, 1, NO_PRNG))();
    for (const c of HASHED_COLUMNS) {
      const w = referenceWorld();
      (w[c] as Int32Array)[0] = ((w[c] as Int32Array)[0] as number) + 1;
      expect(hashState(w, 1, 1, NO_PRNG), c).not.toBe(base);
    }
    for (const c of ['radius', 'prevX', 'prevY', 'pathCount', 'repathAt'] as const) {
      const w = referenceWorld();
      (w[c] as Int32Array)[0] = ((w[c] as Int32Array)[0] as number) + 1;
      expect(hashState(w, 1, 1, NO_PRNG), c).toBe(base);
    }
    const w = referenceWorld();
    w.wpX[0] = 5;
    expect(hashState(w, 1, 1, NO_PRNG)).toBe(base);
  });
  it('hashFull additionally covers pathCount, remaining waypoints, repathAt and grid layers', () => {
    const grid = () => ({ version: 7, terrain: new Uint8Array(16), occ: new Uint8Array(16) });
    const full = (mut: (w: World, g: ReturnType<typeof grid>) => void) => {
      const w = referenceWorld();
      const g = grid();
      mut(w, g);
      return hashStateFull(w, 1, g, NO_PRNG);
    };
    const base = full(() => {});
    expect(full((w) => (w.pathCount[0] = 3))).not.toBe(base);
    expect(full((w) => (w.repathAt[0] = 3))).not.toBe(base);
    expect(
      full((w) => {
        w.pathCount[0] = 3; // pathIdx[0] = 1 -> waypoints 1..2 count
        w.wpX[MAX_WAYPOINTS * 0 + 2] = 5;
      }),
    ).not.toBe(full((w) => (w.pathCount[0] = 3)));
    // waypoints before pathIdx are consumed and must not matter
    expect(
      full((w) => {
        w.pathCount[0] = 3;
        w.wpY[0] = 123;
      }),
    ).toBe(full((w) => (w.pathCount[0] = 3)));
    expect(full((_, g) => (g.terrain[3] = 1))).not.toBe(base);
    expect(full((_, g) => (g.occ[3] = 1))).not.toBe(base);
    expect(base).not.toBe(hashState(referenceWorld(), 1, 7, NO_PRNG));
  });
  it('is stable under unrelated typed-array garbage in dead slots', () => {
    const a = referenceWorld();
    const b = referenceWorld();
    b.posX[3] = 999; // slot 3 is dead; hash must not look at it
    b.velY[3] = 5;
    expect(hashState(a, 1, 1, createPrng(3).getState())).toBe(
      hashState(b, 1, 1, createPrng(3).getState()),
    );
  });
});
