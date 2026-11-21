import { describe, expect, it } from 'vitest';
import { TURN_TICKS, type Command } from '@reinos/shared';
import { ORDER_MOVE, ORDER_NONE, createSim, createStubMovement } from '../src/index';
import { TEST_DATA, eidOf, makeConfig, moveCmd, spawnAt, stopCmd } from './helpers/fixtures';

const cfg = () =>
  makeConfig({
    width: 32,
    height: 32,
    blockedTiles: [[5, 5]],
    spawns: [spawnAt('colono', 0, 1, 1), spawnAt('recluta', 1, 2, 2), spawnAt('jinete', 0, 3, 3)],
  });
const mk = (seed = 7) =>
  createSim(seed, 'test-1', cfg(), TEST_DATA, { movement: createStubMovement });

const script = (turn: number): Command[] =>
  turn === 0
    ? [moveCmd(0, 0, [eidOf(0), eidOf(2)], 20500, 20500), moveCmd(0, 1, [eidOf(1)], 3500, 25500)]
    : turn === 20
      ? [stopCmd(20, 0, [eidOf(2)])]
      : [];

describe('createSim validation', () => {
  it('rejects a different dataVersion', () => {
    expect(() => createSim(1, '0.0.0', cfg(), TEST_DATA)).toThrow(/dataVersion/);
  });
  it('rejects non-uint32 seeds', () => {
    for (const s of [-1, 1.5, 2 ** 32, NaN])
      expect(() => createSim(s, 'test-1', cfg(), TEST_DATA)).toThrow(RangeError);
    expect(() => createSim(0xffffffff, 'test-1', cfg(), TEST_DATA)).not.toThrow();
  });
  it('rejects unknown units', () => {
    const c = cfg();
    c.spawns[0]!.unit = 'dragon';
    expect(() => createSim(1, 'test-1', c, TEST_DATA)).toThrow(/unknown unit/);
  });
  it('rejects spawns on blocked or out-of-map tiles', () => {
    const c = cfg();
    c.spawns.push(spawnAt('colono', 0, 5, 5));
    expect(() => createSim(1, 'test-1', c, TEST_DATA)).toThrow(/blocked/);
    const d = cfg();
    d.spawns.push({ unit: 'colono', owner: 0, x: 40_000, y: 500 });
    expect(() => createSim(1, 'test-1', d, TEST_DATA)).toThrow(/blocked/);
  });
  it('rejects an invalid config (owner out of range, bad RLE)', () => {
    const c = cfg();
    c.spawns[0]!.owner = 5;
    expect(() => createSim(1, 'test-1', c, TEST_DATA)).toThrow();
    const d = cfg();
    d.map.blockedRle = [3];
    expect(() => createSim(1, 'test-1', d, TEST_DATA)).toThrow();
  });
  it('rejects more spawns than maxEntities', () => {
    const c = cfg();
    c.maxEntities = 2;
    expect(() => createSim(1, 'test-1', c, TEST_DATA)).toThrow('entity capacity');
  });
  it('spawns in array order with deterministic eids and data-driven radius/hp', () => {
    const s = mk();
    expect(s.world.count).toBe(3);
    expect(s.world.typeId[2]).toBe(2);
    expect(s.world.radius[2]).toBe(450);
    expect(s.world.hp[1]).toBe(40_000);
    expect(s.world.posX[1]).toBe(2500);
    expect(s.grid.isBlocked(5, 5)).toBe(true);
    expect(s.tick).toBe(0);
    expect(s.turn).toBe(0);
  });
});

describe('step / stepTick', () => {
  it('step === 4 x stepTick (same hashFull and hash) over a scripted game', () => {
    const a = mk();
    const b = mk();
    for (let t = 0; t < 40; t++) {
      const r = a.step(script(t));
      b.stepTick(script(t));
      for (let k = 1; k < TURN_TICKS; k++) b.stepTick();
      expect(a.tick).toBe(b.tick);
      expect(a.hashFull()).toBe(b.hashFull());
      expect(r.hash).toBe(b.hash());
      expect(r.tick).toBe((t + 1) * TURN_TICKS);
      expect(r.turn).toBe(t);
    }
  });
  it('advances exactly TURN_TICKS ticks and reports tick/turn', () => {
    const s = mk();
    expect(s.step([]).tick).toBe(4);
    expect(s.tick).toBe(4);
    expect(s.turn).toBe(1);
    s.stepTick();
    expect(s.tick).toBe(5);
    expect(s.turn).toBe(1);
  });
  it('step off a turn boundary throws; stepTick with commands off-boundary throws', () => {
    const s = mk();
    s.stepTick();
    expect(() => s.step([])).toThrow(RangeError);
    expect(() => s.stepTick([moveCmd(0, 0, [eidOf(0)], 1500, 1500)])).toThrow(RangeError);
    expect(() => s.stepTick([])).not.toThrow();
    expect(s.tick).toBe(2);
  });
  it('commands only act on the first tick of the turn and execute in that turn', () => {
    const s = mk();
    s.step([moveCmd(0, 0, [eidOf(0)], 20500, 1500)]);
    expect(s.world.orderKind[0]).toBe(ORDER_MOVE);
    expect(s.world.posX[0]).toBeGreaterThan(1500); // moved during the turn it was issued
    const r = s.step([moveCmd(0, 0, [eidOf(0)], 1500, 1500)]); // stale turn
    expect(r.rejected).toBe(1);
  });
  it('with the stub mover, a unit arrives in the expected number of ticks', () => {
    const s = mk();
    // colono (speed 40/tick) from x=1500 to x=11500 on a horizontal line: D=10000, arrive=100
    s.step([moveCmd(0, 0, [eidOf(0)], 11500, 1500)]);
    // moves k=ceil((10000-100)/40)=248 times; arrival is detected on the next tick
    while (s.tick < 248) s.stepTick();
    expect(s.world.orderKind[0]).toBe(ORDER_MOVE);
    expect(s.world.posX[0]).toBe(1500 + 248 * 40);
    s.stepTick(); // tick 249: detects arrival
    expect(s.world.orderKind[0]).toBe(ORDER_NONE);
    expect(s.world.posX[0]).toBe(1500 + 248 * 40);
    expect(s.world.velX[0]).toBe(0);
  });
  it('prevX/prevY hold the position at the start of the tick', () => {
    const s = mk();
    s.step([moveCmd(0, 0, [eidOf(0)], 20500, 1500)]);
    const x = s.world.posX[0]!;
    s.stepTick();
    expect(s.world.prevX[0]).toBe(x);
    expect(s.world.posX[0]).toBe(x + 40);
  });
});

describe('determinism of the loop', () => {
  const play = (seed: number, tweak?: (t: number) => Command[]) => {
    const s = mk(seed);
    const per: number[] = [];
    for (let t = 0; t < 60; t++) per.push(s.step((tweak ?? script)(t)).hash);
    return { per, full: s.hashFull() };
  };
  it('same (seed, config, commands) -> same hashes in two instances', () => {
    expect(play(7)).toEqual(play(7));
  });
  it('a different command changes the hash', () => {
    const other = (t: number) =>
      t === 0
        ? [moveCmd(0, 0, [eidOf(0), eidOf(2)], 20500, 20501), ...script(0).slice(1)]
        : script(t);
    expect(play(7, other).full).not.toBe(play(7).full);
  });
  it('a different seed changes the hash (PRNG state is hashed)', () => {
    expect(play(8).per[0]).not.toBe(play(7).per[0]);
    expect(play(8).full).not.toBe(play(7).full);
  });
  it('per-turn hashes are stable and all distinct while units move', () => {
    const a = play(7).per;
    expect(play(7).per).toEqual(a);
    expect(new Set(a.slice(0, 20)).size).toBe(20);
  });
  it('clearCaches mid-game does not change the result', () => {
    const run = (clear: boolean) => {
      const s = mk();
      for (let t = 0; t < 60; t++) {
        s.step(script(t));
        if (clear && t === 30) s.clearCaches();
      }
      return s.hashFull();
    };
    expect(run(true)).toBe(run(false));
  });
  it('hashFull is sensitive to terrain changes', () => {
    const a = mk();
    const b = mk();
    b.grid.setTerrain(9, 9, true);
    expect(a.hashFull()).not.toBe(b.hashFull());
  });
});
