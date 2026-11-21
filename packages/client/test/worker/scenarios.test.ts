import { describe, expect, it } from 'vitest';
import { validateSimConfig, fxToTile } from '@reinos/shared';
import { createSim } from '@reinos/sim';
import {
  SCENARIO_NAMES,
  buildScenario,
  isScenarioName,
  type ScenarioName,
} from '../../src/worker/scenarios';
import { DATA, SEED, moveCmd } from './helpers';

/** Pinned: hash after 200 ticks (50 turns) with one move order for the first 20 units at turn 0. */
const PINNED: Record<ScenarioName, number> = {
  demo100: 2552486542,
  demo400: 4096375533,
};
const UNITS: Record<ScenarioName, number> = { demo100: 100, demo400: 400 };

function hashAfter200(name: ScenarioName, seed: number): number {
  const sim = createSim(seed, DATA.dataVersion, buildScenario(name, seed), DATA);
  sim.step([moveCmd(0, 20, 100, 64)]);
  for (let t = 1; t < 50; t++) sim.step([]);
  expect(sim.tick).toBe(200);
  return sim.hash();
}

describe('scenarios', () => {
  it('exposes both names', () => {
    expect([...SCENARIO_NAMES]).toEqual(['demo100', 'demo400']);
    expect(isScenarioName('demo100')).toBe(true);
    expect(isScenarioName('nope')).toBe(false);
  });

  for (const name of SCENARIO_NAMES) {
    describe(name, () => {
      const config = buildScenario(name, SEED);
      it('passes validateSimConfig and is JSON/structured-clone friendly', () => {
        expect(validateSimConfig(config)).toEqual(config);
        expect(structuredClone(config)).toEqual(config);
        expect(config.map.width).toBe(128);
        expect(config.map.height).toBe(128);
        expect(config.maxPlayers).toBe(2);
        expect(config.spawns).toHaveLength(UNITS[name]);
      });
      it('has lakes/forests (blocked tiles) but spawns only on free tiles', () => {
        let blocked = 0;
        config.map.blockedRle.forEach((n, i) => {
          if (i % 2 === 1) blocked += n;
        });
        expect(blocked).toBeGreaterThan(200);
        expect(blocked).toBeLessThan(128 * 128 * 0.4);
        const sim = createSim(SEED, DATA.dataVersion, config, DATA); // throws on blocked spawns
        expect(sim.world.count).toBe(UNITS[name]);
        for (const s of config.spawns)
          expect(sim.grid.isBlocked(fxToTile(s.x), fxToTile(s.y))).toBe(false);
      });
      it('splits the units between two players in deterministic order', () => {
        expect(config.spawns.filter((s) => s.owner === 0)).toHaveLength(UNITS[name] / 2);
        expect(config.spawns.slice(0, UNITS[name] / 2).every((s) => s.owner === 0)).toBe(true);
        expect(buildScenario(name, SEED)).toEqual(config);
        expect(buildScenario(name, SEED + 1)).not.toEqual(config);
      });
      it('hash after 200 ticks is stable (pinned)', () => {
        const h = hashAfter200(name, SEED);
        expect(hashAfter200(name, SEED)).toBe(h);
        expect(h).toBe(PINNED[name]);
      });
    });
  }
});
