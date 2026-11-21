import { describe, expect, it } from 'vitest';
import { REPLAY_FORMAT_VERSION, serializeReplay, validateReplay } from '@reinos/shared';
import { createSim, createStubMovement, runReplay } from '@reinos/sim';
import {
  SCENARIOS,
  compareGolden,
  generateScenario,
  loadSimData,
  scenarioOptions,
  type Golden,
} from '../src/index';
import { percentile } from '../src/bench';

const data = loadSimData();

describe('scenario generator', () => {
  it('thousand preset matches the plan: 1000 units, 10 000 ticks, groups <= 100', () => {
    const t = SCENARIOS.thousand;
    expect(t.units).toBe(1000);
    expect(t.turns * 4).toBe(10_000);
    expect(t.groupMax).toBeLessThanOrEqual(100);
  });

  it('is reproducible: same options give a byte-identical replay', () => {
    const a = generateScenario(scenarioOptions('small', 11), data).replay;
    const b = generateScenario(scenarioOptions('small', 11), data).replay;
    expect(serializeReplay(a)).toBe(serializeReplay(b));
  });

  it('different seeds give different replays and hashes', () => {
    const hs = [1, 2, 3].map(
      (s) => generateScenario(scenarioOptions('small', s), data).replay.finalHash,
    );
    expect(new Set(hs).size).toBe(3);
  });

  it('produces a valid replay that runReplay confirms (generating run == replay run)', () => {
    const { replay } = generateScenario(scenarioOptions('small', 5), data);
    expect(validateReplay(JSON.parse(serializeReplay(replay)))).toEqual(replay);
    expect(runReplay(replay, data).ok).toBe(true);
  });

  it('has obstacles, an unreachable-goal command and commands for both players', () => {
    const { replay, stats } = generateScenario(scenarioOptions('small', 5), data);
    expect(stats.blockedPermille).toBeGreaterThan(100);
    expect(stats.pocketCommands).toBeGreaterThanOrEqual(1);
    const players = new Set(replay.turns.flatMap((t) => t.cmds.map((c) => c.playerId)));
    expect(players.size).toBe(2);
  });

  it('works with any movement system via SimOptions (stub here), and the hash depends on it only via the sim', () => {
    const stub = { movement: createStubMovement };
    const a = generateScenario(scenarioOptions('small', 5), data, undefined, stub).replay;
    expect(runReplay(a, data, stub).ok).toBe(true);
    // the replay exercises the sim: positions change over time
    const sim = createSim(a.seed, a.dataVersion, a.config, data, stub);
    const x0 = sim.world.posX[0];
    for (let n = 0; n < a.totalTurns; n++) sim.step(a.turns.find((t) => t.n === n)?.cmds ?? []);
    expect(sim.world.posX[0]).not.toBe(x0);
  });
});

describe('golden comparison', () => {
  const { replay } = generateScenario(scenarioOptions('small', 5), data);
  const res = runReplay(replay, data);
  const golden = (over: Partial<Golden> = {}): Golden => ({
    formatVersion: 1,
    scenario: 'thousand',
    seed: 1,
    generatorVersion: 1,
    replayFormatVersion: REPLAY_FORMAT_VERSION,
    dataVersion: replay.dataVersion,
    finalHash: res.finalHash,
    checkpoints: res.checkpoints,
    ...over,
  });
  it('match / unpinned / mismatch / stale', () => {
    expect(compareGolden(golden(), replay, res).kind).toBe('match');
    expect(compareGolden(golden({ finalHash: null }), replay, res).kind).toBe('unpinned');
    expect(compareGolden(golden({ finalHash: (res.finalHash ^ 1) >>> 0 }), replay, res).kind).toBe(
      'mismatch',
    );
    const bad = res.checkpoints.map((c) => [c[0], c[1]] as [number, number]);
    (bad[1] as [number, number])[1] ^= 1;
    const v = compareGolden(golden({ checkpoints: bad }), replay, res);
    expect(v.kind).toBe('mismatch');
    expect(compareGolden(golden({ dataVersion: 'other' }), replay, res).kind).toBe('stale');
    expect(
      compareGolden(golden({ replayFormatVersion: REPLAY_FORMAT_VERSION - 1 }), replay, res).kind,
    ).toBe('stale');
  });
});

describe('percentile', () => {
  it('nearest-rank', () => {
    const a = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(a, 0.95)).toBe(95);
    expect(percentile(a, 0.99)).toBe(99);
    expect(percentile([], 0.5)).toBe(0);
  });
});
