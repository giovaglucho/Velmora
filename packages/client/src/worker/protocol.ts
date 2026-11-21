// ADR-006 §3.1 — message contract between the main thread and the sim Worker. Owner: sim-engineer (W).
// Changes require an ADR-006 amendment. Everything here must be structured-cloneable.
import type { Command, SimConfig } from '@reinos/shared';

export type SnapshotMode = 'sab' | 'transfer';

export type ToWorker =
  | {
      t: 'init';
      seed: number; // uint32
      config: SimConfig;
      speed: number; // game-speed multiplier; default 1
      mode: SnapshotMode;
      /** Only mode === 'sab': created by the main thread with sharedSnapshotBytes(capacity). */
      sab?: SharedArrayBuffer;
      /** The client's own DATA_VERSION; the host refuses to start on mismatch (§3.1 rule 1). */
      dataVersion?: string;
      /** Start paused (deterministic tests drive the sim with `ctl step`). Default false. */
      paused?: boolean;
    }
  | { t: 'cmd'; cmds: Command[] } // SimHost rewrites `turn` (§3.6)
  | { t: 'ctl'; op: 'pause' | 'resume' | 'speed' | 'step'; value?: number }
  | { t: 'recycle'; buffer: ArrayBuffer } // mode 'transfer' only
  | { t: 'probe'; id: number }
  | { t: 'stop' };

export interface ReadyInfo {
  capacity: number;
  dataVersion: string;
  simDataHash: number | null;
  mode: SnapshotMode;
}

export interface PerfInfo {
  tickMsAvg: number;
  tickMsP95: number;
  tickMsMax: number;
  ticksBehind: number;
  ticksDropped: number;
  /** transfer mode: publications skipped because every buffer was in flight (steady state: 0). */
  snapsSkipped: number;
}

export type FromWorker =
  | ({ t: 'ready' } & ReadyInfo)
  | { t: 'snap'; tick: number; buffer: ArrayBuffer }
  | { t: 'snapSab' }
  | { t: 'turn'; turn: number; hash: number; rejected: number }
  | ({ t: 'perf' } & PerfInfo)
  | { t: 'probe'; id: number; hashFull: number }
  | { t: 'error'; message: string };

/** Injected transport so SimHost is testable in Node without `self`. */
export type PostFn = (msg: FromWorker, transfer?: Transferable[]) => void;
