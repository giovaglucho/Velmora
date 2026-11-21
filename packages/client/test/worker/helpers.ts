import { buildSimData, loadGameData } from '@reinos/data';
import { createSim, type Sim } from '@reinos/sim';
import { tileCenterFx, type Command, type SimConfig, type SimData } from '@reinos/shared';
import { buildScenario, type ScenarioName } from '../../src/worker/scenarios';
import type { FromWorker } from '../../src/worker/protocol';
import { createSimHost, type SimHost } from '../../src/worker/host';
import { createSnapshotView } from '../../src/worker/snapshot';

export const DATA: SimData = buildSimData(loadGameData());
export const SEED = 12345;

export function newSim(
  name: ScenarioName = 'demo100',
  seed = SEED,
): { sim: Sim; config: SimConfig } {
  const config = buildScenario(name, seed);
  return { sim: createSim(seed, DATA.dataVersion, config, DATA), config };
}

/** Move command for the first `n` player-0 units (eids of a fresh world: gen 1). */
export function moveCmd(turn: number, n: number, tx: number, ty: number): Command {
  const unitIds: number[] = [];
  for (let i = 0; i < n; i++) unitIds.push((1 << 16) | i);
  return {
    turn,
    playerId: 0,
    type: 'move',
    unitIds,
    target: { kind: 'pos', x: tileCenterFx(tx), y: tileCenterFx(ty) },
    payload: null,
  };
}

export interface Harness {
  host: SimHost;
  msgs: FromWorker[];
  clock: { t: number };
  /** Last snapshot seen (copied at post time): tick and posX of slot 0. */
  lastSnap: { tick: number; posX0: number };
  /** Advances the fake clock in 4 ms pumps. */
  advance(ms: number): void;
}

/** `autoRecycle` (default) hands every snapshot buffer back at once, like a prompt main thread. */
export function makeHarness(autoRecycle = true): Harness {
  const msgs: FromWorker[] = [];
  const clock = { t: 1000 };
  const lastSnap = { tick: -1, posX0: 0 };
  // eslint-disable-next-line prefer-const
  let host: SimHost;
  const post = (m: FromWorker): void => {
    msgs.push(m);
    if (m.t === 'snap') {
      const v = createSnapshotView(m.buffer, 0, 1024);
      lastSnap.tick = v.tick;
      lastSnap.posX0 = v.posX[0] as number;
      if (autoRecycle) host.onMessage({ t: 'recycle', buffer: m.buffer });
    }
  };
  host = createSimHost({ post, now: () => clock.t, data: DATA });
  return {
    host,
    msgs,
    clock,
    lastSnap,
    advance(ms) {
      for (let done = 0; done < ms; done += 4) {
        clock.t += 4;
        host.pump();
      }
    },
  };
}
