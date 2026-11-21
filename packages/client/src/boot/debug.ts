// ADR-006 §10.4 — window.__reinos test API. Only in the Vite dev server, or in a NON-production test build
// (VITE_ENABLE_DEBUG=1, set by the e2e/perf scripts) together with ?debug=1. Render's production build never sets it. Owners: Q + R.
// The object is installed once by main.ts and delegates to the running game (it survives `loadScenario`).
import type { SnapshotMode } from '../worker/protocol';
import type { PerfInfo } from '../worker/protocol';
import type { RenderStats } from '../render/renderer';

export interface ReinosMetrics {
  /** JS per frame: interpolate + cull + sprites + fog/minimap feed (no rasterisation). */
  updateMs: number;
  renderMs: number;
  drawCalls: number;
  /** pointerdown of the last order → end of the render() that shows its marker. */
  inputToMarkerMs: number;
  reactRendersPerSec: number;
  mode: SnapshotMode;
  fps: number;
  frameMs: number;
  visibleUnits: number;
  visibleChunks: number;
  /** Fog texture uploads since the game started. */
  fogUploads: number;
  /** Minimap redraws since the game started (10 Hz throttle). */
  minimapDraws: number;
}

export interface ReinosUnit {
  eid: number;
  owner: number;
  typeId: number;
  /** Screen position (CSS px, canvas at the page origin) of the unit's foot, interpolated. */
  sx: number;
  sy: number;
}

export interface PerfReport {
  scenario: string;
  mode: SnapshotMode;
  frames: number;
  fpsAvg: number;
  fpsP5: number;
  updateMs: { p50: number; p95: number; max: number };
  drawCalls: number;
  sim: PerfInfo;
  note: string;
}

export interface ReinosDebugApi {
  ready: boolean;
  error: string | null;
  scenario: string;
  /** Terrain/unit art in use: the generated provisional set, or the in-memory procedural fallback. */
  assets: 'provisional' | 'procedural';
  tick: number;
  lastTurnHash: number | null;
  metrics: ReinosMetrics;
  stats: RenderStats;
  reactRendersPerSec: number;
  /** Camera centre in world px + zoom level; assigning moves the camera (no animation). */
  camera: { x: number; y: number; zoomIndex: 0 | 1 | 2; zoomT: number };
  /** Replaces the selection (local player's units). */
  select(eids: number[]): void;
  selection(): number[];
  /** Live, fog-visible units of the current frame, projected to the screen. */
  units(): ReinosUnit[];
  fogState(tx: number, ty: number): 0 | 1 | 2;
  screenOfTile(tx: number, ty: number): { sx: number; sy: number };
  control(op: 'pause' | 'resume' | 'step'): void;
  perfReport(): PerfReport;
  /** Tears the game down and boots `name` (demo100 | demo200 | demo400). */
  loadScenario(name: string): Promise<void>;
}

declare global {
  interface Window {
    __reinos?: ReinosDebugApi;
  }
}

export function installDebugApi(api: ReinosDebugApi): void {
  window.__reinos = api;
}
