// ADR-006 §2 — detects cross-origin isolation and chooses the snapshot mode; reads query params.
import type { SnapshotMode } from '../worker/protocol';
import { isScenarioName, type ScenarioName } from '../worker/scenarios';

export interface BootParams {
  scenario: ScenarioName;
  snap: SnapshotMode | 'auto';
  debug: boolean;
  /** `?perf=100|400`: perf-test mode (picks the scenario of that size, shows the dev overlay). */
  perf: number | null;
  /** Scenario/terrain seed (uint32). */
  seed: number;
}

/** Scenario of a plain visit (the K1 load case). */
export const DEFAULT_SCENARIO: ScenarioName = 'demo400';
/** Seed of the demo scenarios (the Worker e2e and the headless goldens use the same one). */
export const DEFAULT_SEED = 12345;

export function chooseSnapshotMode(requested: SnapshotMode | 'auto'): SnapshotMode {
  const sab =
    typeof SharedArrayBuffer !== 'undefined' &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  if (requested === 'sab') return sab ? 'sab' : 'transfer';
  if (requested === 'transfer') return 'transfer';
  return sab ? 'sab' : 'transfer';
}

/** Parses `?scenario=demo100|demo200|demo400&snap=sab|transfer&debug=1&perf=400&seed=N`; unknown values fall back. */
export function readBootParams(search: string, dev = false): BootParams {
  const q = new URLSearchParams(search);
  const perfRaw = q.get('perf');
  const perf = perfRaw !== null && /^\d+$/.test(perfRaw) ? Number(perfRaw) : null;
  const scenarioRaw = q.get('scenario') ?? (perf !== null ? `demo${perf}` : null);
  const scenario =
    scenarioRaw !== null && isScenarioName(scenarioRaw) ? scenarioRaw : DEFAULT_SCENARIO;
  const snapRaw = q.get('snap');
  const snap = snapRaw === 'sab' || snapRaw === 'transfer' ? snapRaw : 'auto';
  const seedRaw = q.get('seed');
  const seed = seedRaw !== null && /^\d+$/.test(seedRaw) ? Number(seedRaw) >>> 0 : DEFAULT_SEED;
  return { scenario, snap, debug: dev || q.get('debug') === '1', perf, seed };
}
