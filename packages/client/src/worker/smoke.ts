// e2e page script (worker-smoke.html): runs the real Worker in Chromium on a fixed scenario and command
// script, then reports per-turn hashes and a snapshot checksum for comparison with Node
// (e2e/render/worker.spec.ts). No DOM access: results go through `globalThis.__workerSmoke`.
import { tileCenterFx, type Command } from '@reinos/shared';
import { snapshotChecksum } from './checksum';
import { createSimClient } from './client';
import { SMOKE_STEP_TURNS, SMOKE_TARGET_TILE, SMOKE_TOTAL_TURNS } from './smokeConfig';
import type { PerfInfo } from './protocol';
import { buildScenario, isScenarioName } from './scenarios';

export interface WorkerSmokeResult {
  mode: string;
  requested: string;
  crossOriginIsolated: boolean;
  capacity: number;
  count: number;
  hashes: number[];
  checksumAfterSteps: number;
  tickAfterSteps: number;
  ticksPerSec: number;
  perf: PerfInfo;
}
export interface WorkerSmokeState {
  done: boolean;
  result?: WorkerSmokeResult;
  error?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred: () => boolean, what: string, timeoutMs = 20000): Promise<void> {
  const t0 = performance.now();
  while (!pred()) {
    if (performance.now() - t0 > timeoutMs) throw new Error('timeout waiting for ' + what);
    await sleep(5);
  }
}

async function main(): Promise<WorkerSmokeResult> {
  const q = new URLSearchParams(location.search);
  const requested = q.get('snap') ?? 'auto';
  const mode = requested === 'sab' || requested === 'transfer' ? requested : undefined;
  const scenario = q.get('scenario') ?? 'demo100';
  if (!isScenarioName(scenario)) throw new Error('unknown scenario ' + scenario);
  const seed = Number(q.get('seed') ?? '12345');
  const config = buildScenario(scenario, seed);

  const client = createSimClient();
  const hashes: number[] = [];
  client.onTurn((t) => {
    hashes[t.turn] = t.hash;
  });
  const ready = await client.start({ seed, config, ...(mode ? { mode } : {}), paused: true });

  const first = client.latest();
  if (first === null) throw new Error('no initial snapshot');
  const unitIds: number[] = [];
  for (let s = 0; s < first.highWater; s++) if (first.owner[s] === 0) unitIds.push(first.eid(s));
  const cmd: Command = {
    turn: 0,
    playerId: 0,
    type: 'move',
    unitIds,
    target: {
      kind: 'pos',
      x: tileCenterFx(SMOKE_TARGET_TILE.x),
      y: tileCenterFx(SMOKE_TARGET_TILE.y),
    },
    payload: null,
  };
  client.send([cmd]);
  for (let i = 1; i <= SMOKE_STEP_TURNS; i++) {
    client.control('step');
    await waitFor(() => hashes[i - 1] !== undefined, 'turn ' + (i - 1));
  }
  const tickAfterSteps = SMOKE_STEP_TURNS * 4;
  let view = client.latest();
  await waitFor(
    () => (view = client.latest()) !== null && view.tick === tickAfterSteps,
    'snapshot',
  );
  const checksumAfterSteps = snapshotChecksum(view as NonNullable<typeof view>);
  const count = (view as NonNullable<typeof view>).count;

  client.control('resume');
  const tick0 = (client.latest() as NonNullable<typeof view>).tick;
  const t0 = performance.now();
  await waitFor(
    () => hashes[SMOKE_TOTAL_TURNS - 1] !== undefined,
    'turn ' + SMOKE_TOTAL_TURNS,
    40000,
  );
  const dt = (performance.now() - t0) / 1000;
  const tick1 = (client.latest() as NonNullable<typeof view>).tick;
  const ticksPerSec = (tick1 - tick0) / dt;
  const result: WorkerSmokeResult = {
    mode: ready.mode,
    requested,
    crossOriginIsolated:
      (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
    capacity: ready.capacity,
    count,
    hashes: hashes.slice(0, SMOKE_TOTAL_TURNS),
    checksumAfterSteps,
    tickAfterSteps,
    ticksPerSec,
    perf: { ...client.perf },
  };
  client.dispose();
  return result;
}

const state: WorkerSmokeState = { done: false };
(globalThis as { __workerSmoke?: WorkerSmokeState }).__workerSmoke = state;
main().then(
  (result) => {
    state.result = result;
    state.done = true;
  },
  (e: unknown) => {
    state.error = e instanceof Error ? e.message : String(e);
    state.done = true;
  },
);
