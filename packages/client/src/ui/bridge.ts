// ADR-006 §8.1 — only writer of the store: publishes at 10 Hz and immediately on selection changes.
// The only ui/ file allowed to know about worker/render/input. It reads through narrow structural
// sources, so it is testable in Node with a fake clock and never calls SimClient.latest() itself
// (that would invalidate the renderer's view): the frame loop hands it the current view.
import type { SnapshotView } from '../worker/snapshot';
import type { SnapshotMode } from '../worker/protocol';
import type { Camera } from '../render/types';
import type { GameView } from './store';
import type { HudIntents } from './intents';
import { publish } from './storeCore';

/** Publication period: 10 Hz (ADR-006 §8.1). */
export const PUBLISH_PERIOD_MS = 100;
const SELECTION_ICONS = 60;

export interface BridgeSelection {
  readonly eids: readonly number[];
  subscribe(cb: (eids: readonly number[]) => void): () => void;
}
export interface BridgeGroups {
  sizes(view: SnapshotView | null): Array<{ size: number }>;
}
export interface BridgeScheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}
export interface BridgeSources {
  getView: () => SnapshotView | null;
  selection: BridgeSelection;
  groups: BridgeGroups;
  getCamera: () => Camera;
  getStats: () => { fps: number; frameMs: number; drawCalls: number };
  getTickMs: () => number;
  /** typeId → data id (units.json), used to group the selection by type. */
  typeKey: (typeId: number) => string;
  mode: () => SnapshotMode;
  localPlayer: () => number;
  /** HUD intents → input/ (e.g. select group). */
  intents: HudIntents;
  scheduler?: BridgeScheduler;
}

export interface Bridge {
  readonly intents: HudIntents;
  /** Builds and publishes the view now (also used by tests). */
  flush(): void;
  dispose(): void;
}

function composeView(s: BridgeSources): GameView {
  const view = s.getView();
  const eids = s.selection.eids;
  const byType: Record<string, number> = {};
  if (view) {
    for (const e of eids) {
      const slot = e & 0xffff;
      const key = s.typeKey(view.typeId[slot] ?? 0);
      byType[key] = (byType[key] ?? 0) + 1;
    }
  }
  const stats = s.getStats();
  return {
    tick: view?.tick ?? 0,
    turn: view?.turn ?? 0,
    selection: { count: eids.length, byType, first60: eids.slice(0, SELECTION_ICONS) },
    controlGroups: s.groups.sizes(view),
    camera: { zoomIndex: s.getCamera().zoomIndex },
    perf: {
      fps: Math.round(stats.fps),
      frameMs: Math.round(stats.frameMs * 10) / 10,
      tickMs: Math.round(s.getTickMs() * 100) / 100,
      drawCalls: stats.drawCalls,
      mode: s.mode(),
    },
    localPlayer: s.localPlayer(),
  };
}

export function startBridge(s: BridgeSources): Bridge {
  const sched: BridgeScheduler = s.scheduler ?? {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  };
  const flush = () => publish(composeView(s));
  flush();
  const handle = sched.setInterval(flush, PUBLISH_PERIOD_MS);
  // Selection changes are user events (never per frame): publish right away so the HUD never lags a click.
  const unsub = s.selection.subscribe(flush);
  return {
    intents: s.intents,
    flush,
    dispose() {
      sched.clearInterval(handle);
      unsub();
    },
  };
}
