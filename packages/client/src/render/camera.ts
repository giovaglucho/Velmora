// ADR-006 §4.2 — camera state and zoom. PURE. Owner: render-engineer (R1).
import type { Camera, Viewport, ZoomIndex } from './types';

export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function createCamera(): Camera {
  throw new Error('TODO(R1): createCamera');
}
/** Visible rectangle in world px. */
export function viewRectWorld(_cam: Camera, _vp: Viewport): WorldRect {
  throw new Error('TODO(R1): viewRectWorld');
}
export function centerOnFx(_cam: Camera, _fxX: number, _fxY: number): void {
  throw new Error('TODO(R1): centerOnFx');
}
export function centerOnGrid(_cam: Camera, _gx: number, _gy: number): void {
  throw new Error('TODO(R1): centerOnGrid');
}
/** Sets the target zoom level, anchored to the cursor (screen px). */
export function setZoomAnchored(
  _cam: Camera,
  _vp: Viewport,
  _zoomIndex: ZoomIndex,
  _anchorSx: number,
  _anchorSy: number,
): void {
  throw new Error('TODO(R1): setZoomAnchored');
}
/** Exponential approach (τ from game.json camera.zoomTauMs) of zoomT to ZOOMS[zoomIndex]. */
export function stepZoom(_cam: Camera, _dtMs: number, _tauMs: number): void {
  throw new Error('TODO(R1): stepZoom');
}
/** Clamps the centre to the map diamond expanded by `marginTiles` (default 4). */
export function clampCamera(
  _cam: Camera,
  _mapW: number,
  _mapH: number,
  _marginTiles?: number,
): void {
  throw new Error('TODO(R1): clampCamera');
}
