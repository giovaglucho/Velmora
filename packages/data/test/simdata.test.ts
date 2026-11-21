import { describe, expect, it } from 'vitest';
import {
  FX_SCALE,
  TICKS_PER_SECOND,
  type SimData,
  type MovementTuning,
} from '../../shared/src/index';
import { DATA_VERSION, bundledRaw, buildSimData, loadGameData, parseSchemas } from '../src/index';

// Cross-package check (test only): data cannot import shared in src (contracts.md), but the
// shapes must stay in sync, so the test imports shared by relative path.
const data = loadGameData();
const sim: SimData = buildSimData(data); // compile-time assignability to the shared type
const tuning: MovementTuning = sim.movement;

describe('buildSimData', () => {
  it('is versioned 0.2.0 and consistent with shared constants', () => {
    expect(DATA_VERSION).toBe('0.2.1');
    expect(sim.dataVersion).toBe(DATA_VERSION);
    expect(data.economy.fixedScale).toBe(FX_SCALE);
    expect(TICKS_PER_SECOND).toBe(20);
  });
  it('has one entry per unit, in units.json order, all integers', () => {
    const n = data.units.length;
    expect(sim.unitIds).toEqual(data.units.map((u) => u.id));
    for (const arr of [sim.speedFxPerTick, sim.radiusFx, sim.hpFx]) {
      expect(arr.length).toBe(n);
      for (const v of arr) expect(Number.isInteger(v) && v > 0).toBe(true);
    }
    for (const v of Object.values(tuning)) expect(Number.isInteger(v)).toBe(true);
    expect(new Set(sim.unitIds).size).toBe(n);
  });
  it('speed: round(speed * fixedScale / TICKS_PER_SECOND)', () => {
    const idx = (id: string) => sim.unitIds.indexOf(id);
    expect(sim.speedFxPerTick[idx('colono')]).toBe(40); // 0.8 tiles/s
    expect(sim.speedFxPerTick[idx('recluta')]).toBe(45); // 0.9 tiles/s
    data.units.forEach((u, i) =>
      expect(sim.speedFxPerTick[i]).toBe(Math.round((u.speed * FX_SCALE) / TICKS_PER_SECOND)),
    );
  });
  it('hp: hp * fixedScale', () => {
    const c = data.units.findIndex((u) => u.id === 'colono');
    expect(sim.hpFx[c]).toBe(25_000);
    data.units.forEach((u, i) => expect(sim.hpFx[i]).toBe(u.hp * FX_SCALE));
  });
  it('radius: max over classes, default for unmapped classes', () => {
    const mv = data.game.movement;
    data.units.forEach((u, i) => {
      const want = Math.max(...u.classes.map((c) => mv.radiusFxByClass[c] ?? mv.defaultRadiusFx));
      expect(sim.radiusFx[i]).toBe(want);
    });
    const archerCav = data.units.find((u) => u.classes.length > 1)!;
    expect(sim.radiusFx[data.units.indexOf(archerCav)]).toBe(
      Math.max(...archerCav.classes.map((c) => mv.radiusFxByClass[c] ?? mv.defaultRadiusFx)),
    );
  });
  it('movement tuning is copied verbatim from game.json and excludes adapter-only fields', () => {
    const mv = data.game.movement;
    expect(sim.movement).toEqual({
      pathBudgetPerTick: mv.pathBudgetPerTick,
      arriveDistFx: mv.arriveDistFx,
      groupArriveDistFx: mv.groupArriveDistFx,
      stuckTicks: mv.stuckTicks,
      repathCooldownTicks: mv.repathCooldownTicks,
      separationPermille: mv.separationPermille,
      neighborRangeFx: mv.neighborRangeFx,
      minProgressPermille: mv.minProgressPermille,
    });
    expect(Object.keys(sim.movement)).not.toContain('radiusFxByClass');
  });
  it('is deterministic (same data -> deep-equal result)', () => {
    expect(buildSimData(loadGameData())).toEqual(sim);
  });
});

describe('game.json movement schema (strict, integers)', () => {
  const withMovement = (patch: (m: Record<string, unknown>) => void) => {
    const raw = structuredClone(bundledRaw) as typeof bundledRaw & {
      game: { movement: Record<string, unknown> };
    };
    patch(raw.game.movement);
    return raw;
  };
  it('rejects a missing movement block', () => {
    const raw = structuredClone(bundledRaw) as { game: Record<string, unknown> };
    delete raw.game.movement;
    expect(() => parseSchemas(raw as typeof bundledRaw)).toThrow();
  });
  it('rejects unknown keys, floats, non-positive values and unknown classes', () => {
    expect(() => parseSchemas(withMovement((m) => (m.extra = 1)))).toThrow();
    expect(() => parseSchemas(withMovement((m) => (m.stuckTicks = 2.5)))).toThrow();
    expect(() => parseSchemas(withMovement((m) => (m.pathBudgetPerTick = 0)))).toThrow();
    expect(() => parseSchemas(withMovement((m) => delete m.neighborRangeFx))).toThrow();
    expect(() =>
      parseSchemas(withMovement((m) => (m.radiusFxByClass = { dragon: 300 }))),
    ).toThrow();
    expect(() =>
      parseSchemas(withMovement((m) => (m.radiusFxByClass = { civil: 12.5 }))),
    ).toThrow();
  });
  it('rejects arriveDistFx > groupArriveDistFx', () => {
    expect(() =>
      parseSchemas(
        withMovement((m) => {
          m.arriveDistFx = 5000;
          m.groupArriveDistFx = 1000;
        }),
      ),
    ).toThrow(/arriveDistFx/);
  });
});
