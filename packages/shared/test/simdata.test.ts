import { describe, expect, it } from 'vitest';
import { simDataHash, validateSimConfig, type SimData } from '../src/index';

const base = (): SimData => ({
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
});

describe('simDataHash', () => {
  it('is a pinned uint32 (changing the layout breaks replay compatibility)', () => {
    const h = simDataHash(base());
    expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
    expect(h).toBe(PINNED);
  });
  it('is pure: equal content, equal hash', () => {
    expect(simDataHash(base())).toBe(simDataHash(structuredClone(base())));
  });
  it('changes when any movement value changes', () => {
    const h0 = simDataHash(base());
    for (const k of Object.keys(base().movement) as (keyof SimData['movement'])[]) {
      const d = base();
      d.movement[k] += 1;
      expect(simDataHash(d), k).not.toBe(h0);
    }
  });
  it('changes when any array element, id or the version changes', () => {
    const h0 = simDataHash(base());
    const variants: ((d: SimData) => void)[] = [
      (d) => void (d.dataVersion = 'test-2'),
      (d) => void (d.unitIds = ['colono', 'recluta', 'jinetx']),
      (d) => void (d.speedFxPerTick = [40, 45, 71]),
      (d) => void (d.radiusFx = [250, 301, 450]),
      (d) => void (d.hpFx = [25_000, 40_000, 100_001]),
      (d) => void (d.hpFx = [25_000, 40_000, 100_000, 1]),
      (d) => void (d.speedFxPerTick = [45, 40, 70]),
    ];
    for (const [i, f] of variants.entries()) {
      const d = base();
      f(d);
      expect(simDataHash(d), 'variant ' + i).not.toBe(h0);
    }
  });
  it('does not alias values that differ only above 32 bits', () => {
    const a = base();
    const b = base();
    a.hpFx = [1, 2, 3];
    b.hpFx = [1 + 2 ** 32, 2, 3];
    expect(simDataHash(a)).not.toBe(simDataHash(b));
  });
  it('rejects non-integer values instead of truncating them', () => {
    const d = base();
    d.movement.arriveDistFx = 100.5;
    expect(() => simDataHash(d)).toThrow(RangeError);
    const e = base();
    e.speedFxPerTick = [40, NaN, 70];
    expect(() => simDataHash(e)).toThrow(RangeError);
  });
});

describe('SimConfig.simDataHash', () => {
  const cfg = {
    maxPlayers: 2,
    maxEntities: 8,
    map: { width: 2, height: 2, blockedRle: [4] },
    spawns: [],
  };
  it('is optional and validated as uint32', () => {
    expect(validateSimConfig(cfg).simDataHash).toBeUndefined();
    expect(validateSimConfig({ ...cfg, simDataHash: 7 }).simDataHash).toBe(7);
    expect(() => validateSimConfig({ ...cfg, simDataHash: -1 })).toThrow(/simDataHash/);
    expect(() => validateSimConfig({ ...cfg, simDataHash: 1.5 })).toThrow(/simDataHash/);
  });
});

const PINNED = 558010557; // cross-checked with an independent FNV-1a implementation
