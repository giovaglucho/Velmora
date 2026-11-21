// `pnpm test:det`: the 1000 units x 10 000 ticks scenario against tools/headless/golden.json.
// Regenerate with `pnpm --filter @reinos/headless run golden:update` after an INTENDED sim change.
// An unpinned golden (finalHash null) fails in CI and only checks reproducibility locally.
import { describe, expect, it } from 'vitest';
import { runReplay } from '@reinos/sim';
import { GOLDEN_PATH } from '../../src/golden-path';
import { compareGolden, goldenScenario, loadSimData, readGolden } from '../../src/index';

describe('golden hashes: thousand scenario (Node)', () => {
  const data = loadSimData();
  const golden = readGolden(GOLDEN_PATH);
  const replay = goldenScenario(golden, data);
  const res = runReplay(replay, data);

  it('the generating run and an independent replay run agree', () => {
    expect(res.ok).toBe(true);
    expect(res.finalHash).toBe(replay.finalHash);
    expect(replay.totalTurns * 4).toBe(10_000);
    expect(replay.config.spawns).toHaveLength(1000);
  });

  it('matches golden.json', () => {
    const v = compareGolden(golden, replay, res);
    if (v.kind === 'unpinned') {
      if (process.env.CI)
        expect.fail(
          'golden.json is unpinned; run `pnpm --filter @reinos/headless run golden:update`',
        );
      console.warn(
        'golden.json unpinned (finalHash 0x' +
          res.finalHash.toString(16) +
          '): reproducibility only',
      );
      return;
    }
    if (v.kind === 'stale')
      expect.fail('golden.json is stale (' + v.reason + '); run golden:update');
    expect(v.kind === 'mismatch' ? v.reason : 'match').toBe('match');
  });
});
