// ADR-006 §2 / plan W3 — demo scenarios (geometry only, no balance numbers). Owner: sim-engineer (W3).
import type { SimConfig } from '@reinos/shared';

export type ScenarioName = 'demo100' | 'demo400';

export function buildScenario(_name: ScenarioName, _seed: number): SimConfig {
  throw new Error('TODO(W3): buildScenario');
}
