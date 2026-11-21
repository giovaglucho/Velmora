// ADR-006 §3 / plan W2: the sim Worker runs in a real browser (Chromium), publishes snapshots at ~20 Hz
// and reproduces the Node simulation bit for bit, in both transports (`?snap=sab` and `?snap=transfer`).
import { expect, test } from '@playwright/test';
import { tileCenterFx, type Command } from '../../packages/shared/src/index';
import { createSim } from '../../packages/sim/src/index';
import { loadSimData } from '../../tools/headless/src/index';
import { snapshotChecksum } from '../../packages/client/src/worker/checksum';
import { buildScenario } from '../../packages/client/src/worker/scenarios';
import {
  createSnapshotView,
  createSnapshotWriter,
  snapshotLayout,
} from '../../packages/client/src/worker/snapshot';
import {
  SMOKE_STEP_TURNS,
  SMOKE_TARGET_TILE,
  SMOKE_TOTAL_TURNS,
} from '../../packages/client/src/worker/smokeConfig';
import type { WorkerSmokeResult, WorkerSmokeState } from '../../packages/client/src/worker/smoke';

const SEED = 12345;

/** Same script as smoke.ts, run headless in Node: hashes per turn + snapshot checksum after the steps. */
function expected(): { hashes: number[]; checksum: number; tick: number; count: number } {
  const data = loadSimData();
  const config = buildScenario('demo100', SEED);
  const sim = createSim(SEED, data.dataVersion, config, data);
  const unitIds: number[] = [];
  for (let s = 0; s < sim.world.highWater; s++)
    if (sim.world.owner[s] === 0) unitIds.push(((sim.world.gen[s] as number) << 16) | s);
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
  const hashes: number[] = [];
  let checksum = 0;
  let count = 0;
  for (let t = 0; t < SMOKE_TOTAL_TURNS; t++) {
    hashes.push(sim.step(t === 0 ? [cmd] : []).hash);
    if (t === SMOKE_STEP_TURNS - 1) {
      const cap = config.maxEntities;
      const buf = new ArrayBuffer(snapshotLayout(cap).totalBytes);
      createSnapshotWriter(buf, 0, cap).write(sim.world, sim.tick, sim.turn, 50000, 128, 128);
      checksum = snapshotChecksum(createSnapshotView(buf, 0, cap));
      count = sim.world.count;
    }
  }
  return { hashes, checksum, tick: SMOKE_STEP_TURNS * 4, count };
}

const exp = expected();

for (const mode of ['sab', 'transfer'] as const) {
  test(`sim Worker in Chromium (?snap=${mode}): hashes == headless, 20 Hz, snapshot pipeline exact`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push('console.error: ' + m.text());
    });

    await page.goto(`/worker-smoke.html?snap=${mode}&scenario=demo100&seed=${SEED}`);
    await page.waitForFunction(
      () =>
        (window as unknown as { __workerSmoke?: WorkerSmokeState }).__workerSmoke?.done === true,
      undefined,
      { timeout: 50_000 },
    );
    const state = await page.evaluate(
      () => (window as unknown as { __workerSmoke: WorkerSmokeState }).__workerSmoke,
    );
    console.log(
      'workerSmoke',
      mode,
      JSON.stringify({ ...state, result: undefined }),
      JSON.stringify(state.result && { ...state.result, hashes: state.result.hashes.length }),
    );
    expect(state.error).toBeUndefined();
    const r = state.result as WorkerSmokeResult;

    // The page is cross-origin isolated (vite preview sends COOP/COEP), so `sab` really uses SAB.
    expect(r.crossOriginIsolated).toBe(true);
    expect(r.mode).toBe(mode);
    expect(r.capacity).toBe(1024);

    // 1. The Worker reproduces Node: per-turn hash for all 30 turns (incl. 12 paused `step` turns).
    expect(r.hashes).toEqual(exp.hashes);
    // 2. The snapshot pipeline (writer -> transport -> reader) shows the same state as the sim in Node.
    expect(r.tickAfterSteps).toBe(exp.tick);
    expect(r.count).toBe(exp.count);
    expect(r.checksumAfterSteps).toBe(exp.checksum);
    // 3. Real-time pacing: ~20 ticks/s (generous bounds: CI machines are slow and noisy).
    expect(r.ticksPerSec).toBeGreaterThan(14);
    expect(r.ticksPerSec).toBeLessThan(21);
    expect(r.perf.ticksDropped).toBe(0);
    expect(r.perf.snapsSkipped).toBe(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });
}
