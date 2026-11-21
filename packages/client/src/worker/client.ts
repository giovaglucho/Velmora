// ADR-006 §3.5 — main-thread interface to the Worker. Owner: sim-engineer (W2).
import { DATA_VERSION } from '@reinos/data';
import type { Command, SimConfig } from '@reinos/shared';
import type { FromWorker, PerfInfo, ReadyInfo, SnapshotMode, ToWorker } from './protocol';
import {
  createSabSource,
  createSharedSnapshotBuffer,
  createTransferSource,
  sabAvailable,
  type SnapshotSource,
  type SnapshotView,
  type TransferSource,
} from './snapshot';

export type { SnapshotView } from './snapshot';

export interface TurnInfo {
  turn: number;
  hash: number;
  rejected: number;
}

export interface SimClient {
  start(init: {
    seed: number;
    config: SimConfig;
    speed?: number;
    mode?: SnapshotMode;
    /** Start paused (tests drive the sim with control('step')). */
    paused?: boolean;
  }): Promise<ReadyInfo>;
  /** Latest snapshot; null if none. The view is valid only until the next call to latest(). */
  latest(): SnapshotView | null;
  /** performance.now() at which latest() first observed its tick: interpolation base. */
  readonly latestArrivalMs: number;
  send(cmds: Command[]): void;
  control(op: 'pause' | 'resume' | 'speed' | 'step', value?: number): void;
  onTurn(cb: (t: TurnInfo) => void): () => void;
  readonly perf: Readonly<PerfInfo>;
  dispose(): void;
}

/** The slice of `Worker` the client uses; lets tests wire the client to a SimHost in-process. */
export interface WorkerLike {
  postMessage(msg: ToWorker, transfer?: Transferable[]): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
  terminate(): void;
}

export interface SimClientOptions {
  createWorker?: () => WorkerLike;
  /** performance.now by default. */
  now?: () => number;
}

function defaultWorker(): WorkerLike {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerLike;
}

const ZERO_PERF: PerfInfo = {
  tickMsAvg: 0,
  tickMsP95: 0,
  tickMsMax: 0,
  ticksBehind: 0,
  ticksDropped: 0,
  snapsSkipped: 0,
};

export function createSimClient(opts: SimClientOptions = {}): SimClient {
  const now = opts.now ?? ((): number => performance.now());
  let worker: WorkerLike | null = null;
  let source: SnapshotSource | null = null;
  let transfer: TransferSource | null = null;
  let capacity = 0;
  let sab: SharedArrayBuffer | undefined;
  let lastTick = -1;
  let arrivalMs = 0;
  let perf: PerfInfo = ZERO_PERF;
  const turnCbs = new Set<(t: TurnInfo) => void>();
  let resolveReady: ((r: ReadyInfo) => void) | null = null;
  let rejectReady: ((e: Error) => void) | null = null;

  const openTransfer = (cap: number): void => {
    transfer = createTransferSource(cap, (buffer) =>
      worker?.postMessage({ t: 'recycle', buffer }, [buffer]),
    );
    source = transfer;
  };

  const onMessage = (m: FromWorker): void => {
    switch (m.t) {
      case 'ready': {
        const info: ReadyInfo = {
          capacity: m.capacity,
          dataVersion: m.dataVersion,
          simDataHash: m.simDataHash,
          mode: m.mode,
        };
        if (info.mode === 'sab' && sab !== undefined)
          source ??= createSabSource(sab, info.capacity);
        else if (transfer === null) openTransfer(info.capacity);
        resolveReady?.(info);
        resolveReady = rejectReady = null;
        return;
      }
      case 'snap':
        // The host publishes the tick-0 snapshot BEFORE `ready`, so the source must already exist.
        if (transfer === null) openTransfer(capacity);
        transfer?.push(m.buffer);
        return;
      case 'turn':
        for (const cb of [...turnCbs]) cb({ turn: m.turn, hash: m.hash, rejected: m.rejected });
        return;
      case 'perf': {
        perf = {
          tickMsAvg: m.tickMsAvg,
          tickMsP95: m.tickMsP95,
          tickMsMax: m.tickMsMax,
          ticksBehind: m.ticksBehind,
          ticksDropped: m.ticksDropped,
          snapsSkipped: m.snapsSkipped,
        };
        return;
      }
      case 'error':
        if (rejectReady !== null) {
          rejectReady(new Error(m.message));
          resolveReady = rejectReady = null;
        } else console.error('[sim worker]', m.message);
        return;
      default:
        return;
    }
  };

  return {
    start(init) {
      if (worker !== null) return Promise.reject(new Error('SimClient already started'));
      const w = (opts.createWorker ?? defaultWorker)();
      worker = w;
      capacity = init.config.maxEntities;
      const mode: SnapshotMode =
        init.mode === 'sab' || init.mode === undefined
          ? sabAvailable()
            ? 'sab'
            : 'transfer'
          : 'transfer';
      sab = mode === 'sab' ? createSharedSnapshotBuffer(capacity) : undefined;
      if (sab !== undefined) source = createSabSource(sab, capacity);
      else openTransfer(capacity);
      return new Promise<ReadyInfo>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
        w.onmessage = (e) => onMessage(e.data);
        w.onerror = (e) => onMessage({ t: 'error', message: e.message ?? 'worker error' });
        const msg: ToWorker = {
          t: 'init',
          seed: init.seed,
          config: init.config,
          speed: init.speed ?? 1,
          mode,
          dataVersion: DATA_VERSION,
          paused: init.paused === true,
          ...(sab !== undefined ? { sab } : {}),
        };
        w.postMessage(msg);
      });
    },
    latest() {
      const view = source?.latest() ?? null;
      if (view !== null && view.tick !== lastTick) {
        lastTick = view.tick;
        arrivalMs = now();
      }
      return view;
    },
    get latestArrivalMs() {
      return arrivalMs;
    },
    send(cmds) {
      worker?.postMessage({ t: 'cmd', cmds });
    },
    control(op, value) {
      worker?.postMessage(value === undefined ? { t: 'ctl', op } : { t: 'ctl', op, value });
    },
    onTurn(cb) {
      turnCbs.add(cb);
      return () => turnCbs.delete(cb);
    },
    get perf() {
      return perf;
    },
    dispose() {
      worker?.postMessage({ t: 'stop' });
      worker?.terminate();
      worker = null;
      source?.dispose();
      source = null;
      transfer = null;
      turnCbs.clear();
    },
  };
}
