// ADR-006 §3.5 — main-thread interface to the Worker. Owner: sim-engineer (W2).
import type { Command, SimConfig } from '@reinos/shared';
import type { PerfInfo, ReadyInfo, SnapshotMode } from './protocol';
import type { SnapshotView } from './snapshot';

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

export function createSimClient(): SimClient {
  throw new Error('TODO(W2): createSimClient');
}
