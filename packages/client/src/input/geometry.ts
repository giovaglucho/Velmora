// ADR-006 §5 — the pure projection/camera functions the input layer needs, as an injectable interface.
// The production implementation is built from render/{iso,camera,culling,depth} (pure, no Pixi); tests inject
// their own implementation so input/ can be developed and verified independently of the render lane.
import type { SnapshotView } from '../worker/snapshot';
import type { Camera, Vec2, Viewport, ZoomIndex } from '../render/types';
import { centerOnGrid, clampCamera, setZoomAnchored, stepZoom } from '../render/camera';
import { spriteVisible } from '../render/culling';
import { depthKey } from '../render/depth';
import {
  ellipseForRadius,
  gridToFx,
  gridToWorld,
  interpolatedPos,
  screenToGrid,
  worldToScreen,
} from '../render/iso';

export interface InputGeometry {
  screenToGrid(cam: Camera, vp: Viewport, sx: number, sy: number): Vec2;
  worldToScreen(cam: Camera, vp: Viewport, wx: number, wy: number): Vec2;
  gridToWorld(gx: number, gy: number, h?: number): Vec2;
  /** Tiles → Fx: the single rounding towards the sim. */
  gridToFx(g: number): number;
  ellipseForRadius(radiusFx: number): { rx: number; ry: number };
  interpolatedPos(view: SnapshotView, slot: number, alpha: number): Vec2;
  depthKey(fxX: number, fxY: number, slot: number, h?: number): number;
  spriteVisible(sx: number, sy: number, zoom: number, vp: Viewport): boolean;
  centerOnGrid(cam: Camera, gx: number, gy: number): void;
  setZoomAnchored(
    cam: Camera,
    vp: Viewport,
    zoomIndex: ZoomIndex,
    anchorSx: number,
    anchorSy: number,
  ): void;
  stepZoom(cam: Camera, dtMs: number, tauMs: number): void;
  clampCamera(cam: Camera, mapW: number, mapH: number, marginTiles?: number): void;
}

/** Production geometry: thin delegation to the pure render modules. */
export const renderGeometry: InputGeometry = {
  screenToGrid,
  worldToScreen,
  gridToWorld,
  gridToFx,
  ellipseForRadius,
  interpolatedPos,
  depthKey,
  spriteVisible,
  centerOnGrid,
  setZoomAnchored,
  stepZoom,
  clampCamera,
};

/** Interpolation factor of the current frame (ADR-006 §3.7). */
export function interpolationAlpha(
  nowMs: number,
  arrivalMs: number,
  tickIntervalUs: number,
): number {
  const span = tickIntervalUs / 1000;
  if (span <= 0) return 1;
  const a = (nowMs - arrivalMs) / span;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}
