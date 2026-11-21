// ADR-006 §3.6 — SimHost: pacing (20 Hz), command scheduler, stats. No `self`; testable in Node. Owner: W.
import { buildSimData, loadGameData } from '@reinos/data';
import { createSim, type Sim } from '@reinos/sim';
import {
  TICK_MS,
  TURN_TICKS,
  commandShapeError,
  simDataHash,
  type Command,
  type SimConfig,
  type SimData,
} from '@reinos/shared';
import type { PerfInfo, PostFn, ToWorker } from './protocol';
import {
  createSabPublisher,
  createTransferPublisher,
  type SnapshotPublisher,
  type TransferPublisher,
} from './snapshot';

export interface SimHostDeps {
  post: PostFn;
  /** Monotonic clock in ms (performance.now in the Worker, fake in tests). */
  now: () => number;
  /** Override for tests; defaults to `buildSimData(loadGameData())`. */
  data?: SimData;
  /** Lockstep seam (F9 plugs n+2 here). Defaults to the next turn boundary. */
  scheduleTurn?: ScheduleTurn;
}

/** Lockstep seam: F2 returns `currentTurn` (next boundary); F9 replaces it with n+2. */
export type ScheduleTurn = (currentTurn: number) => number;

export interface CommandScheduler {
  push(cmds: Command[]): void;
  /** Drains everything queued, rewriting `turn` to the scheduled turn. */
  drain(currentTurn: number): Command[];
}

export interface SimHost {
  onMessage(msg: ToWorker): void;
  /** One pacing step (called by setInterval(4 ms) in the Worker). */
  pump(): void;
  dispose(): void;
}

/** Max ticks simulated per pump (keeps the Worker responsive to messages). */
const MAX_BATCH_TICKS = 4;
/** If still this many ticks behind after a batch, the excess is dropped (single player only). */
const MAX_BEHIND_TICKS = 10;
const PERF_INTERVAL_MS = 1000;
const PERF_SAMPLES = 256;
const MIN_SPEED = 0.05;
const MAX_SPEED = 64;

const defaultSchedule: ScheduleTurn = (currentTurn) => currentTurn;

export function createCommandScheduler(
  scheduleTurn: ScheduleTurn = defaultSchedule,
): CommandScheduler {
  let queue: Command[] = [];
  return {
    push(cmds) {
      for (const c of cmds) queue.push(c);
    },
    drain(currentTurn) {
      if (queue.length === 0) return queue;
      const turn = scheduleTurn(currentTurn);
      const out = queue.map((c) => ({ ...c, turn }));
      queue = [];
      return out;
    },
  };
}

interface Running {
  sim: Sim;
  config: SimConfig;
  publisher: SnapshotPublisher;
  transfer: TransferPublisher | null;
  capacity: number;
}

export function createSimHost(deps: SimHostDeps): SimHost {
  const { post, now } = deps;
  const scheduler = createCommandScheduler(deps.scheduleTurn);
  let run: Running | null = null;
  let started = false;
  let stopped = false;
  let paused = false;
  let speed = 1;
  let acc = 0;
  let last = 0;
  let rejected = 0;
  let ticksDropped = 0;
  let ticksBehind = 0;
  let publishPending = false;
  let perfAt = 0;
  const samples = new Float64Array(PERF_SAMPLES);
  const sorted = new Float64Array(PERF_SAMPLES);
  let nSamples = 0;
  let sampleHead = 0;

  const intervalMs = (): number => TICK_MS / speed;

  const fail = (message: string): void => {
    post({ t: 'error', message });
  };

  const publish = (): void => {
    if (run === null) return;
    const { sim, config, publisher } = run;
    const ok = publisher.publish(
      sim.world,
      sim.tick,
      sim.turn,
      Math.round((TICK_MS * 1000) / speed),
      config.map.width,
      config.map.height,
    );
    publishPending = !ok;
  };

  const runTick = (): void => {
    const r = run as Running;
    const t0 = now();
    if (r.sim.tick % TURN_TICKS === 0) {
      const cmds = scheduler.drain(r.sim.turn);
      if (cmds.length > 0) r.sim.stepTick(cmds);
      else r.sim.stepTick();
    } else r.sim.stepTick();
    const dt = now() - t0;
    samples[sampleHead] = dt;
    sampleHead = (sampleHead + 1) % PERF_SAMPLES;
    if (nSamples < PERF_SAMPLES) nSamples++;
    if (r.sim.tick % TURN_TICKS === 0) {
      post({
        t: 'turn',
        turn: r.sim.turn - 1,
        hash: r.sim.hash(),
        rejected,
        skippedUnits: r.sim.lastSkippedUnits,
      });
      rejected = 0;
    }
  };

  const postPerf = (): void => {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < nSamples; i++) {
      const v = samples[i] as number;
      sorted[i] = v;
      sum += v;
      if (v > max) max = v;
    }
    let p95 = 0;
    if (nSamples > 0) {
      const view = sorted.subarray(0, nSamples);
      view.sort();
      p95 = view[Math.min(nSamples - 1, Math.floor(nSamples * 0.95))] as number;
    }
    const info: PerfInfo = {
      tickMsAvg: nSamples > 0 ? sum / nSamples : 0,
      tickMsP95: p95,
      tickMsMax: max,
      ticksBehind,
      ticksDropped,
      snapsSkipped: run?.transfer?.skipped ?? 0,
    };
    post({ t: 'perf', ...info });
    nSamples = 0;
    sampleHead = 0;
  };

  const init = (msg: Extract<ToWorker, { t: 'init' }>): void => {
    if (started) return fail('init received twice');
    started = true;
    try {
      const data = deps.data ?? (buildSimData(loadGameData()) as SimData);
      if (msg.dataVersion !== undefined && msg.dataVersion !== data.dataVersion)
        throw new Error(
          'dataVersion mismatch: client "' +
            msg.dataVersion +
            '" vs worker "' +
            data.dataVersion +
            '"',
        );
      const dataHash = simDataHash(data);
      if (msg.simDataHash !== undefined && msg.simDataHash !== dataHash)
        throw new Error(
          'simDataHash mismatch: client ' + msg.simDataHash + ' vs worker ' + dataHash,
        );
      if (!Number.isFinite(msg.speed) || msg.speed < MIN_SPEED || msg.speed > MAX_SPEED)
        throw new RangeError('speed out of range');
      const sim = createSim(msg.seed, data.dataVersion, msg.config, data);
      const capacity = sim.world.capacity;
      let publisher: SnapshotPublisher;
      let transfer: TransferPublisher | null = null;
      if (msg.mode === 'sab' && msg.sab !== undefined && typeof SharedArrayBuffer !== 'undefined') {
        publisher = createSabPublisher(msg.sab, capacity);
      } else {
        transfer = createTransferPublisher(capacity, (m, tr) => post(m, tr));
        publisher = transfer;
      }
      speed = msg.speed;
      paused = msg.paused === true;
      run = { sim, config: msg.config, publisher, transfer, capacity };
      // Tick-0 snapshot first, so `ready` really means "you can read snapshots".
      publish();
      post({
        t: 'ready',
        capacity,
        dataVersion: data.dataVersion,
        simDataHash: dataHash,
        mode: publisher.mode,
      });
      last = now();
      perfAt = last;
    } catch (e) {
      run = null;
      fail(e instanceof Error ? e.message : String(e));
    }
  };

  const enqueue = (raw: unknown): void => {
    if (!Array.isArray(raw)) {
      rejected++;
      return;
    }
    const ok: Command[] = [];
    const maxPlayers = run?.config.maxPlayers ?? 0;
    for (const c of raw as unknown[]) {
      if (commandShapeError(c) === null && (c as Command).playerId < maxPlayers)
        ok.push(c as Command);
      else rejected++;
    }
    scheduler.push(ok);
  };

  const stepOneTurn = (): void => {
    const r = run as Running;
    do runTick();
    while (r.sim.tick % TURN_TICKS !== 0);
    publish();
  };

  const control = (op: string, value: number | undefined): void => {
    if (run === null) return;
    switch (op) {
      case 'pause':
        paused = true;
        return;
      case 'resume':
        if (paused) {
          paused = false;
          acc = 0;
          last = now();
        }
        return;
      case 'speed':
        if (
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= MIN_SPEED &&
          value <= MAX_SPEED
        )
          speed = value;
        return;
      case 'step':
        if (paused) stepOneTurn();
        return;
      default:
        return;
    }
  };

  return {
    onMessage(msg) {
      if (stopped || typeof msg !== 'object' || msg === null) return;
      try {
        switch (msg.t) {
          case 'init':
            init(msg);
            return;
          case 'cmd':
            enqueue(msg.cmds);
            return;
          case 'ctl':
            control(msg.op, msg.value);
            return;
          case 'recycle':
            if (msg.buffer instanceof ArrayBuffer) run?.transfer?.recycle(msg.buffer);
            return;
          case 'probe':
            if (run !== null) post({ t: 'probe', id: msg.id, hashFull: run.sim.hashFull() });
            return;
          case 'stop':
            stopped = true;
            run = null;
            return;
          default:
            return;
        }
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    },

    pump() {
      if (stopped || run === null) return;
      const t = now();
      const dt = t - last;
      last = t;
      let advanced = false;
      if (!paused) {
        acc += dt;
        const step = intervalMs();
        let batch = 0;
        try {
          while (acc >= step && batch < MAX_BATCH_TICKS) {
            runTick();
            acc -= step;
            batch++;
            advanced = true;
          }
        } catch (e) {
          paused = true;
          fail(e instanceof Error ? e.message : String(e));
        }
        ticksBehind = Math.floor(acc / step);
        if (acc > MAX_BEHIND_TICKS * step) {
          acc = 0;
          ticksDropped++;
        }
      }
      if (advanced || publishPending) publish();
      if (t - perfAt >= PERF_INTERVAL_MS) {
        perfAt = t;
        postPerf();
      }
    },

    dispose() {
      stopped = true;
      run = null;
    },
  };
}
