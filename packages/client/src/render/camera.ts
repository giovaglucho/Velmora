// ADR-006 §4.2 — camera state and zoom. PURE. Owner: render-engineer (R1).
import { ZOOMS } from './constants';
import { gridToWorld, worldToGrid } from './iso';
import type { Camera, Viewport, ZoomIndex } from './types';

export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Zoom 1 (index 1), centred on the world origin. */
export function createCamera(): Camera {
  return { x: 0, y: 0, zoomIndex: 1, zoomT: ZOOMS[1], anchor: null };
}
/** Visible rectangle in world px. */
export function viewRectWorld(cam: Camera, vp: Viewport): WorldRect {
  const hw = vp.vw / 2 / cam.zoomT;
  const hh = vp.vh / 2 / cam.zoomT;
  return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
}
export function centerOnFx(cam: Camera, fxX: number, fxY: number): void {
  centerOnGrid(cam, fxX / 1000, fxY / 1000);
}
export function centerOnGrid(cam: Camera, gx: number, gy: number): void {
  const w = gridToWorld(gx, gy);
  cam.x = w.x;
  cam.y = w.y;
  cam.anchor = null;
}
/** Sets the target zoom level, anchored to the cursor (screen px). */
export function setZoomAnchored(
  cam: Camera,
  vp: Viewport,
  zoomIndex: ZoomIndex,
  anchorSx: number,
  anchorSy: number,
): void {
  if (zoomIndex === cam.zoomIndex && !cam.anchor) return;
  const dx = anchorSx - vp.vw / 2;
  const dy = anchorSy - vp.vh / 2;
  // Keep the anchor of a zoom already in flight: the point under the cursor is the same one.
  const wx = cam.x + dx / cam.zoomT;
  const wy = cam.y + dy / cam.zoomT;
  cam.zoomIndex = zoomIndex;
  cam.anchor = { dx, dy, wx, wy };
}
/** Exponential approach (τ from game.json camera.zoomTauMs) of zoomT to ZOOMS[zoomIndex]. */
export function stepZoom(cam: Camera, dtMs: number, tauMs: number): void {
  const target = ZOOMS[cam.zoomIndex];
  if (cam.zoomT !== target) {
    const k = tauMs > 0 ? 1 - Math.exp(-Math.max(dtMs, 0) / tauMs) : 1;
    cam.zoomT += (target - cam.zoomT) * k;
    if (Math.abs(target - cam.zoomT) < 1e-3) cam.zoomT = target;
  }
  const a = cam.anchor;
  if (a) {
    cam.x = a.wx - a.dx / cam.zoomT;
    cam.y = a.wy - a.dy / cam.zoomT;
    if (cam.zoomT === target) cam.anchor = null;
  }
}
/** Clamps the centre to the map diamond (a rectangle in grid space) expanded by `marginTiles` (default 4). */
export function clampCamera(cam: Camera, mapW: number, mapH: number, marginTiles = 4): void {
  const g = worldToGrid(cam.x, cam.y);
  const gx = Math.min(Math.max(g.x, -marginTiles), mapW + marginTiles);
  const gy = Math.min(Math.max(g.y, -marginTiles), mapH + marginTiles);
  if (gx !== g.x || gy !== g.y) {
    const w = gridToWorld(gx, gy);
    cam.x = w.x;
    cam.y = w.y;
  }
}
