// Browser bundle of the simulation (esbuild IIFE). Exposes `ReinosSim.run` on the main thread
// and doubles as the Worker script (the same text is loaded from a Blob URL).
import { runReplay } from '@reinos/sim';
import type { Replay, SimData } from '@reinos/shared';

export interface RunOutput {
  finalHash: number;
  checkpoints: [number, number][];
  ok: boolean;
  firstDivergentCheckpoint: number | null;
  elapsedMs: number;
  /** Where the code ran: "main" or "worker". */
  context: string;
}

function run(replay: Replay, data: SimData, context: string): RunOutput {
  const t0 = performance.now();
  const r = runReplay(replay, data);
  return { ...r, elapsedMs: performance.now() - t0, context };
}

interface WorkerLike {
  onmessage: ((e: { data: RunOutput }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
}
interface BrowserGlobals {
  Worker?: new (url: string) => WorkerLike;
  Blob: new (parts: string[], opts: { type: string }) => object;
  URL: { createObjectURL(b: object): string };
}

/** Runs the replay inside a dedicated Worker created from `bundleSource` (this same bundle). */
function runInWorker(bundleSource: string, replay: Replay, data: SimData): Promise<RunOutput> {
  const g = globalThis as unknown as BrowserGlobals;
  const url = g.URL.createObjectURL(new g.Blob([bundleSource], { type: 'text/javascript' }));
  return new Promise((resolve, reject) => {
    const w = new (g.Worker as NonNullable<BrowserGlobals['Worker']>)(url);
    w.onmessage = (e) => {
      w.terminate();
      resolve(e.data);
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error('worker error: ' + (e.message ?? 'unknown')));
    };
    w.postMessage({ replay, data });
  });
}

const scope = globalThis as unknown as {
  document?: unknown;
  onmessage?: (e: { data: { replay: Replay; data: SimData } }) => void;
  postMessage?: (m: unknown) => void;
  ReinosSim?: unknown;
};
if (scope.document === undefined && typeof scope.postMessage === 'function') {
  // Worker context
  scope.onmessage = (e) => {
    (scope.postMessage as (m: unknown) => void)(run(e.data.replay, e.data.data, 'worker'));
  };
} else {
  scope.ReinosSim = {
    run: (replay: Replay, data: SimData) => run(replay, data, 'main'),
    runInWorker,
  };
}
