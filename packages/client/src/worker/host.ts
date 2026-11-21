// ADR-006 §3.6 — SimHost: pacing (20 Hz), command scheduler, stats. No `self`; testable in Node. Owner: W.
import type { Command } from '@reinos/shared';
import type { PostFn, ToWorker } from './protocol';

export interface SimHostDeps {
  post: PostFn;
  /** Monotonic clock in ms (performance.now in the Worker, fake in tests). */
  now: () => number;
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

export function createSimHost(_deps: SimHostDeps): SimHost {
  throw new Error('TODO(W2): createSimHost');
}
