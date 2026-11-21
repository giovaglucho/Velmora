// ADR-006 §2 — detects cross-origin isolation and chooses the snapshot mode; reads query params.
import type { SnapshotMode } from '../worker/protocol';

export interface BootParams {
  scenario: 'demo100' | 'demo400';
  snap: SnapshotMode | 'auto';
  debug: boolean;
  perf: number | null;
}

export function chooseSnapshotMode(requested: SnapshotMode | 'auto'): SnapshotMode {
  const sab =
    typeof SharedArrayBuffer !== 'undefined' &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;
  if (requested === 'sab') return sab ? 'sab' : 'transfer';
  if (requested === 'transfer') return 'transfer';
  return sab ? 'sab' : 'transfer';
}

export function readBootParams(_search: string): BootParams {
  throw new Error('TODO(I1): readBootParams');
}
