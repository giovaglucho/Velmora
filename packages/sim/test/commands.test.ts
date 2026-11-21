import { describe, expect, it } from 'vitest';
import { createPrng, validateCommandShape, type Command } from '@reinos/shared';
import {
  ORDER_MOVE,
  ORDER_NONE,
  PATH_IDLE,
  PATH_QUEUED,
  createSim,
  createStubMovement,
} from '../src/index';
import type { MovementFactory } from '../src/index';
import { TEST_DATA, eidOf, makeConfig, moveCmd, spawnAt, stopCmd } from './helpers/fixtures';

const cfg = (extra: Parameters<typeof makeConfig>[0] = {}) =>
  makeConfig({
    spawns: [spawnAt('colono', 0, 1, 1), spawnAt('colono', 0, 2, 1), spawnAt('recluta', 1, 3, 1)],
    ...extra,
  });
const mk = (extra?: Parameters<typeof makeConfig>[0], movement?: MovementFactory) =>
  createSim(1, 'test-1', cfg(extra), TEST_DATA, { movement: movement ?? createStubMovement });
const E0 = eidOf(0);
const E1 = eidOf(1);
const E2 = eidOf(2);

/** Movement that records enqueue calls but does nothing else. */
function recorder() {
  const calls: number[] = [];
  const f: MovementFactory = () => ({
    enqueue: (e) => void calls.push(e),
    clearCaches() {},
    update() {},
  });
  return { calls, f };
}

describe('rejection (whole command discarded, counted)', () => {
  const cases: [string, (c: Command) => unknown][] = [
    ['wrong turn (future)', (c) => ({ ...c, turn: 1 })],
    ['wrong turn (past)', (c) => ({ ...c, turn: -1 })],
    ['player out of range for the match', (c) => ({ ...c, playerId: 2 })],
    ['player out of shape range', (c) => ({ ...c, playerId: 9 })],
    ['unknown type', (c) => ({ ...c, type: 'attack' })],
    ['payload not null', (c) => ({ ...c, payload: 1 })],
    ['empty unitIds', (c) => ({ ...c, unitIds: [] })],
    ['float coordinate', (c) => ({ ...c, target: { kind: 'pos', x: 1.5, y: 1 } })],
    ['extra key', (c) => ({ ...c, extra: 1 })],
    ['garbage', () => 42],
    ['null', () => null],
  ];
  for (const [name, mutate] of cases)
    it(name, () => {
      const rec = recorder();
      const sim = mk(undefined, rec.f);
      const before = sim.hashFull();
      const bad = mutate(moveCmd(0, 0, [E0], 5500, 5500)) as Command;
      const r = sim.step([bad]);
      expect(r.rejected).toBe(1);
      expect(rec.calls).toEqual([]);
      expect(sim.world.orderKind[0]).toBe(ORDER_NONE);
      expect(before).not.toBe(sim.hashFull()); // tick advanced, only that
    });
  it('valid + invalid in one turn: only the invalid one is counted', () => {
    const sim = mk();
    const r = sim.step([moveCmd(0, 0, [E0], 5500, 5500), moveCmd(3, 0, [E0], 1500, 1500)]);
    expect(r.rejected).toBe(1);
    expect(sim.world.goalX[0]).toBe(5500);
  });
});

describe('per-unit filtering', () => {
  it('skips foreign, dead and stale units but applies the rest', () => {
    const rec = recorder();
    const sim = mk(undefined, rec.f);
    // E2 belongs to player 1; 0x5ffff is dead; eid with wrong generation is stale
    const r = sim.step([moveCmd(0, 0, [E2, E1, 0x5ffff, eidOf(0, 2), E0], 4500, 4500)]);
    expect(r.rejected).toBe(0);
    expect(r.skippedUnits).toBe(3); // E2 foreign, 0x5ffff dead, wrong generation stale
    expect(rec.calls).toEqual([E0, E1]);
    expect(sim.world.orderKind[2]).toBe(ORDER_NONE);
  });
  it('counts duplicates and resets the counters every turn (not hashed)', () => {
    const sim = mk();
    const r = sim.step([moveCmd(0, 0, [E0, E0, E1], 4500, 4500)]);
    expect(r.skippedUnits).toBe(1);
    expect(r.rejected).toBe(0);
    const r2 = sim.step([]);
    expect(r2.skippedUnits).toBe(0);
    expect(sim.lastSkippedUnits).toBe(0);
    // same commands, same hash regardless of how often the counters were read
    const a = mk();
    const b = mk();
    a.step([moveCmd(0, 0, [E0, E0, E2], 4500, 4500)]);
    b.step([moveCmd(0, 0, [E0], 4500, 4500)]);
    expect(a.hashFull()).toBe(b.hashFull());
  });
  it('a stale eid after slot reuse does not command the new tenant', () => {
    const sim = mk();
    // free slot 0 via a manual despawn and respawn another unit there
    const w = sim.world;
    const old = E0;
    w.alive[0] = 0;
    w.gen[0] = 2;
    w.alive[0] = 1;
    sim.step([moveCmd(0, 0, [old], 4500, 4500)]);
    expect(w.orderKind[0]).toBe(ORDER_NONE);
    expect(w.orderKind[1]).toBe(ORDER_NONE);
  });
  it('duplicates in unitIds are applied once; the caller array is not mutated', () => {
    const rec = recorder();
    const sim = mk(undefined, rec.f);
    const ids = [E1, E0, E1, E0, E1];
    const copy = ids.slice();
    sim.step([moveCmd(0, 0, ids, 4500, 4500)]);
    expect(rec.calls).toEqual([E0, E1]);
    expect(ids).toEqual(copy);
  });
  it('permuting unitIds does not change the result', () => {
    const run = (ids: number[]) => {
      const s = mk();
      s.step([moveCmd(0, 0, ids, 9500, 3500)]);
      for (let i = 0; i < 20; i++) s.step([]);
      return s.hashFull();
    };
    expect(run([E0, E1])).toBe(run([E1, E0]));
    expect(run([E0, E1, E0])).toBe(run([E1, E0]));
  });
});

describe('move semantics', () => {
  it('sets order, goal, queues once and resets path state', () => {
    const rec = recorder();
    const sim = mk(undefined, rec.f);
    const w = sim.world;
    w.pathCount[0] = 5;
    w.pathIdx[0] = 2;
    w.stuck[0] = 9;
    w.repathAt[0] = 77;
    sim.step([moveCmd(0, 0, [E0], 8000, 9000)]);
    expect(w.orderKind[0]).toBe(ORDER_MOVE);
    expect([w.goalX[0], w.goalY[0]]).toEqual([8000, 9000]);
    expect(w.pathState[0]).toBe(PATH_QUEUED);
    expect([w.pathCount[0], w.pathIdx[0], w.stuck[0], w.repathAt[0]]).toEqual([0, 0, 0, 0]);
    expect(rec.calls).toEqual([E0]);
  });
  it('a second move while QUEUED only changes the goal and does not re-enqueue', () => {
    const rec = recorder();
    const sim = mk(undefined, rec.f);
    sim.step([moveCmd(0, 0, [E0], 8000, 9000)]);
    sim.step([moveCmd(1, 0, [E0], 2500, 2500)]);
    expect(rec.calls).toEqual([E0]);
    expect([sim.world.goalX[0], sim.world.goalY[0]]).toEqual([2500, 2500]);
  });
  it('goal outside the map is clamped to [500, size*1000-500]', () => {
    const sim = mk();
    sim.step([moveCmd(0, 0, [E0], 0, 0), moveCmd(0, 1, [E2], 512000, 512000)]);
    expect([sim.world.goalX[0], sim.world.goalY[0]]).toEqual([500, 500]);
    expect([sim.world.goalX[2], sim.world.goalY[2]]).toEqual([15500, 15500]);
  });
  it('goal on a blocked tile snaps to the centre of the nearest free tile', () => {
    const sim = mk({ blockedTiles: [[8, 8]] });
    sim.step([moveCmd(0, 0, [E0], 8300, 8700)]);
    // ring 1 row-major: first free is (7,7)
    expect([sim.world.goalX[0], sim.world.goalY[0]]).toEqual([7500, 7500]);
    const surrounded = mk({
      blockedTiles: [
        [8, 8],
        [7, 7],
        [8, 7],
        [9, 7],
        [7, 8],
        [9, 8],
        [7, 9],
        [8, 9],
        [9, 9],
      ].slice(0, 9) as [number, number][],
    });
    surrounded.step([moveCmd(0, 0, [E0], 8500, 8500)]);
    expect([surrounded.world.goalX[0], surrounded.world.goalY[0]]).toEqual([6500, 6500]);
  });
  it('a fully blocked map leaves the order unissued', () => {
    const blocked: [number, number][] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) blocked.push([x, y]);
    const c = makeConfig({ width: 4, height: 4, blockedTiles: blocked });
    const sim = createSim(1, 'test-1', c, TEST_DATA);
    expect(() => sim.step([moveCmd(0, 0, [1], 500, 500)])).not.toThrow();
  });
});

describe('stop', () => {
  it('clears order, velocity and path; invalidates a queued entry', () => {
    const sim = mk();
    sim.step([moveCmd(0, 0, [E0], 9500, 1500)]);
    sim.step([]);
    expect(sim.world.velX[0]).not.toBe(0);
    sim.step([stopCmd(2, 0, [E0])]);
    const w = sim.world;
    expect([w.orderKind[0], w.velX[0], w.velY[0], w.pathState[0], w.pathCount[0]]).toEqual([
      ORDER_NONE,
      0,
      0,
      PATH_IDLE,
      0,
    ]);
    const x = w.posX[0];
    for (let i = 0; i < 10; i++) sim.step([]);
    expect(w.posX[0]).toBe(x);
  });
  it('stop in the same turn after move leaves the unit idle and never path-resolved', () => {
    // two commands from the same player, arrival order: move then stop
    const sim = mk();
    sim.step([moveCmd(0, 0, [E0], 9500, 1500), stopCmd(0, 0, [E0])]);
    for (let i = 0; i < 5; i++) sim.step([]);
    expect(sim.world.orderKind[0]).toBe(ORDER_NONE);
    expect(sim.world.pathState[0]).toBe(PATH_IDLE);
    expect(sim.world.posX[0]).toBe(1500);
  });
});

describe('ordering', () => {
  it('permuting commands of DIFFERENT players does not change hashFull', () => {
    const a = moveCmd(0, 0, [E0, E1], 9500, 9500);
    const b = moveCmd(0, 1, [E2], 2500, 2500);
    const run = (cmds: Command[]) => {
      const s = mk();
      s.step(cmds);
      for (let i = 0; i < 30; i++) s.step([]);
      return s.hashFull();
    };
    expect(run([a, b])).toBe(run([b, a]));
  });
  it('same-player commands apply in arrival order (last wins)', () => {
    const s1 = mk();
    s1.step([moveCmd(0, 0, [E0], 3500, 3500), moveCmd(0, 0, [E0], 6500, 6500)]);
    expect([s1.world.goalX[0], s1.world.goalY[0]]).toEqual([6500, 6500]);
    const s2 = mk();
    s2.step([moveCmd(0, 0, [E0], 6500, 6500), moveCmd(0, 0, [E0], 3500, 3500)]);
    expect([s2.world.goalX[0], s2.world.goalY[0]]).toEqual([3500, 3500]);
  });
  it('enqueue order is playerId ascending, then unit ascending', () => {
    const rec = recorder();
    const sim = mk(undefined, rec.f);
    sim.step([moveCmd(0, 1, [E2], 2500, 2500), moveCmd(0, 0, [E1, E0], 2500, 2500)]);
    expect(rec.calls).toEqual([E0, E1, E2]);
  });
  it('does not mutate the commands array passed by the caller', () => {
    const cmds = [moveCmd(0, 1, [E2], 2500, 2500), moveCmd(0, 0, [E0], 2500, 2500)];
    const snapshot = JSON.stringify(cmds);
    const order = cmds.slice();
    mk().step(cmds);
    expect(JSON.stringify(cmds)).toBe(snapshot);
    expect(cmds).toEqual(order);
  });
});

describe('fuzz (10^4 random commands incl. garbage)', () => {
  it('never throws, shape validator is coherent with the sim, and runs are reproducible', () => {
    const run = () => {
      const rng = createPrng(0xfa22);
      const sim = mk({ maxEntities: 64 });
      let rejected = 0;
      let wellFormedExecutable = 0;
      let sent = 0;
      const junk = [null, undefined, 3, 'x', [], {}, { turn: 0 }, NaN, () => 1];
      for (let t = 0; t < 1000; t++) {
        const cmds: unknown[] = [];
        for (let k = 0; k < 10; k++) {
          const r = rng.nextInt(10);
          let c: unknown;
          if (r === 0) c = junk[rng.nextInt(junk.length)];
          else {
            const ids: number[] = [];
            for (let n = rng.nextInt(4) + 1; n > 0; n--) ids.push(rng.nextInt(1 << 18));
            const base = (rng.nextInt(2) === 0
              ? moveCmd(
                  t,
                  rng.nextInt(3),
                  ids,
                  rng.nextInt(20000) - 2000,
                  rng.nextInt(20000) - 2000,
                )
              : stopCmd(t, rng.nextInt(3), ids)) as unknown as Record<string, unknown>;
            const m = rng.nextInt(8);
            if (m === 0) base.turn = t + 1 + rng.nextInt(3);
            else if (m === 1) base.payload = 1;
            else if (m === 2) base.type = 'bogus';
            else if (m === 3) base.unitIds = [];
            else if (m === 4 && base.target) (base.target as { x: number }).x = 0.5;
            else if (m === 5) base.extra = true;
            c = base;
          }
          cmds.push(c);
          sent++;
          if (validateCommandShape(c) && (c as Command).turn === t && (c as Command).playerId < 2)
            wellFormedExecutable++;
        }
        const res = sim.step(cmds as Command[]);
        rejected += res.rejected;
        expect(res.rejected).toBe(
          cmds.filter(
            (c) =>
              !(
                validateCommandShape(c) &&
                (c as Command).turn === t &&
                (c as Command).playerId < 2
              ),
          ).length,
        );
      }
      expect(sent).toBe(10_000);
      expect(rejected + wellFormedExecutable).toBe(sent);
      expect(rejected).toBeGreaterThan(1000);
      expect(wellFormedExecutable).toBeGreaterThan(1000);
      return sim.hashFull();
    };
    expect(run()).toBe(run());
  });
});
