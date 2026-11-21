// ADR-006 §8.1 — read-only game view store (10 Hz). Owner: ui-engineer (U4).
// Exports ONLY useGameView and getGameView; the setter is private to bridge.ts via `publish`.
import type { SnapshotMode } from '../worker/protocol';

export interface GameView {
  tick: number;
  turn: number;
  selection: { count: number; byType: Record<string, number>; first60: number[] };
  controlGroups: Array<{ size: number }>; // 10 entries
  camera: { zoomIndex: 0 | 1 | 2 };
  perf: { fps: number; frameMs: number; tickMs: number; drawCalls: number; mode: SnapshotMode };
  localPlayer: number;
}

export function getGameView(): GameView {
  throw new Error('TODO(U4): getGameView');
}
export function useGameView<T>(_selector: (v: GameView) => T): T {
  throw new Error('TODO(U4): useGameView');
}
