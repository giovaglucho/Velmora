// Golden hash file (tools/headless/golden.json) for the 1000 units x 10 000 ticks scenario.
import { readFileSync, writeFileSync } from 'node:fs';
import { REPLAY_FORMAT_VERSION, type Replay, type SimData } from '@reinos/shared';
import { GENERATOR_VERSION, generateScenario, scenarioOptions } from './scenario';
import { runReplay } from '@reinos/sim';

export interface Golden {
  /** File layout version. */
  formatVersion: 1;
  scenario: 'thousand';
  seed: number;
  generatorVersion: number;
  replayFormatVersion: number;
  dataVersion: string | null;
  /** null while unpinned (movement still changing): `golden:update` fills it. */
  finalHash: number | null;
  checkpoints: [number, number][] | null;
}

export function readGolden(file: string): Golden {
  return JSON.parse(readFileSync(file, 'utf8')) as Golden;
}

export function writeGolden(g: Golden, file: string): void {
  writeFileSync(file, JSON.stringify(g, null, 2) + '\n');
}

/** Builds the golden scenario replay (the scenario run itself computes finalHash/checkpoints). */
export function goldenScenario(g: Golden, data: SimData): Replay {
  return generateScenario(scenarioOptions(g.scenario, g.seed), data).replay;
}

/** Regenerates the golden from the current sim, verifying it with an independent replay run. */
export function computeGolden(old: Golden, data: SimData): Golden {
  const replay = goldenScenario(old, data);
  const check = runReplay(replay, data);
  if (!check.ok)
    throw new Error('golden: replay run disagrees with the generating run (non-determinism?)');
  return {
    ...old,
    generatorVersion: GENERATOR_VERSION,
    replayFormatVersion: REPLAY_FORMAT_VERSION,
    dataVersion: replay.dataVersion,
    finalHash: replay.finalHash,
    checkpoints: replay.checkpoints ?? [],
  };
}

export type GoldenVerdict =
  | { kind: 'match' }
  | { kind: 'unpinned' }
  | { kind: 'stale'; reason: string }
  | { kind: 'mismatch'; reason: string };

/** Compares a golden with a replay of the golden scenario (already run: `result`). */
export function compareGolden(
  g: Golden,
  replay: Replay,
  result: { finalHash: number; checkpoints: [number, number][] },
): GoldenVerdict {
  if (g.finalHash === null || g.checkpoints === null) return { kind: 'unpinned' };
  if (g.generatorVersion !== GENERATOR_VERSION)
    return {
      kind: 'stale',
      reason: 'generatorVersion ' + g.generatorVersion + ' != ' + GENERATOR_VERSION,
    };
  if (g.replayFormatVersion !== REPLAY_FORMAT_VERSION)
    return { kind: 'stale', reason: 'replayFormatVersion changed' };
  if (g.dataVersion !== replay.dataVersion)
    return { kind: 'stale', reason: 'dataVersion ' + g.dataVersion + ' != ' + replay.dataVersion };
  for (let i = 0; i < g.checkpoints.length; i++) {
    const want = g.checkpoints[i] as [number, number];
    const got = result.checkpoints[i];
    if (got === undefined || got[0] !== want[0] || got[1] !== want[1])
      return {
        kind: 'mismatch',
        reason:
          'first divergent checkpoint at turn ' +
          want[0] +
          ': golden ' +
          want[1] +
          ' vs ' +
          (got?.[1] ?? 'missing'),
      };
  }
  if (g.finalHash !== result.finalHash)
    return {
      kind: 'mismatch',
      reason: 'finalHash golden ' + g.finalHash + ' vs ' + result.finalHash,
    };
  return { kind: 'match' };
}
