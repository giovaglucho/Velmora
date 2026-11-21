// INTERNAL to ui/: owns the Zustand store and its only writer. Imported by store.ts (read-only facade)
// and bridge.ts (single writer). No other module may import it (enforced by test/ui/store.test.ts).
import { createStore } from 'zustand/vanilla';
import type { GameView } from './store';

export const EMPTY_GAME_VIEW: GameView = {
  tick: 0,
  turn: 0,
  selection: { count: 0, byType: {}, first60: [] },
  controlGroups: Array.from({ length: 10 }, () => ({ size: 0 })),
  camera: { zoomIndex: 1 },
  perf: { fps: 0, frameMs: 0, tickMs: 0, drawCalls: 0, mode: 'transfer' },
  localPlayer: 0,
};

export const gameStore = createStore<GameView>(() => EMPTY_GAME_VIEW);

/** Replaces the whole view (the store keeps a single immutable snapshot per publication). */
export function publish(next: GameView): void {
  gameStore.setState(next, true);
}
