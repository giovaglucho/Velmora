// ADR-006 §10.4 — window.__reinos test API (only with ?debug=1 or import.meta.env.DEV). Owners: Q + R.
export interface ReinosDebugApi {
  ready: boolean;
  tick: number;
  lastTurnHash: number | null;
  metrics: {
    updateMs: number;
    drawCalls: number;
    inputToMarkerMs: number;
    reactRendersPerSec: number;
    mode: 'sab' | 'transfer';
  };
  camera: { x: number; y: number; zoomIndex: 0 | 1 | 2 };
  select(eids: number[]): void;
  units(): Array<{ eid: number; sx: number; sy: number }>;
  fogState(tx: number, ty: number): 0 | 1 | 2;
  screenOfTile(tx: number, ty: number): { sx: number; sy: number };
  perfReport(): unknown;
  loadScenario(name: string): Promise<void>;
}

export function installDebugApi(_api: ReinosDebugApi): void {
  throw new Error('TODO(Q1): installDebugApi');
}
