// I1 — query-string parsing of the boot (scenario / snap / debug / perf / seed).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO,
  DEFAULT_SEED,
  chooseSnapshotMode,
  readBootParams,
} from '../../src/boot/isolation';

describe('readBootParams', () => {
  it('defaults: demo400, auto snapshot mode, no debug, default seed', () => {
    expect(readBootParams('')).toEqual({
      scenario: DEFAULT_SCENARIO,
      snap: 'auto',
      debug: false,
      perf: null,
      seed: DEFAULT_SEED,
    });
    expect(DEFAULT_SCENARIO).toBe('demo400');
  });

  it('reads scenario, snap, debug and seed', () => {
    const p = readBootParams('?scenario=demo100&snap=transfer&debug=1&seed=7');
    expect(p).toMatchObject({ scenario: 'demo100', snap: 'transfer', debug: true, seed: 7 });
  });

  it('ignores unknown scenario / snap / seed values', () => {
    const p = readBootParams('?scenario=nope&snap=sharedwhatever&seed=-3');
    expect(p).toMatchObject({ scenario: DEFAULT_SCENARIO, snap: 'auto', seed: DEFAULT_SEED });
  });

  it('?perf=100 picks the matching scenario unless one is given explicitly', () => {
    expect(readBootParams('?perf=100')).toMatchObject({ perf: 100, scenario: 'demo100' });
    expect(readBootParams('?perf=100&scenario=demo400').scenario).toBe('demo400');
    expect(readBootParams('?perf=abc').perf).toBeNull();
  });

  it('dev builds always enable the debug API', () => {
    expect(readBootParams('', true).debug).toBe(true);
  });
});

describe('chooseSnapshotMode', () => {
  it('explicit transfer always wins', () => {
    expect(chooseSnapshotMode('transfer')).toBe('transfer');
  });
});
