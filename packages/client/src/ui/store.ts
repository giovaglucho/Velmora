// ADR-006 §8.1 — read-only game view store (10 Hz). Owner: ui-engineer (U4).
// Exports ONLY useGameView and getGameView (+ the GameView type): the writer lives in storeCore.ts and is
// used by bridge.ts alone. React components never mutate game state; they emit intents (ui/intents.ts).
import { useSyncExternalStore } from 'react';
import type { SnapshotMode } from '../worker/protocol';
import { gameStore } from './storeCore';

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
  return gameStore.getState();
}

export function useGameView<T>(selector: (v: GameView) => T): T {
  // Same contract as zustand's hook (selectors must return stable references), but the server snapshot
  // is the live state too, so the HUD can be rendered/tested without a DOM.
  const read = () => selector(gameStore.getState());
  return useSyncExternalStore(gameStore.subscribe, read, read);
}
