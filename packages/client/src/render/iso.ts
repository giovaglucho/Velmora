// ADR-006 §4.1 — isometric 2:1 projection. PURE: no Pixi, no DOM, no time. Owner: render-engineer (R1).
import { ELEV_PX, HALF_H, HALF_W, MAX_INTERP_JUMP_FX } from './constants';
import type { Camera, Vec2, Viewport } from './types';
import type { SnapshotView } from '../worker/snapshot';

/** Fx per tile (ADR-005: Fx = 1/1000 tile). */
const FX_PER_TILE = 1000;

/** Grid (tiles, float) → world px at zoom 1. `h` = elevation levels. */
export function gridToWorld(gx: number, gy: number, h = 0): Vec2 {
  return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H - h * ELEV_PX };
}
/** Inverse for h = 0. */
export function worldToGrid(wx: number, wy: number): Vec2 {
  const a = wx / HALF_W;
  const b = wy / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
export function worldToScreen(cam: Camera, vp: Viewport, wx: number, wy: number): Vec2 {
  return { x: (wx - cam.x) * cam.zoomT + vp.vw / 2, y: (wy - cam.y) * cam.zoomT + vp.vh / 2 };
}
export function screenToWorld(cam: Camera, vp: Viewport, sx: number, sy: number): Vec2 {
  return { x: (sx - vp.vw / 2) / cam.zoomT + cam.x, y: (sy - vp.vh / 2) / cam.zoomT + cam.y };
}
export function screenToGrid(cam: Camera, vp: Viewport, sx: number, sy: number): Vec2 {
  const w = screenToWorld(cam, vp, sx, sy);
  return worldToGrid(w.x, w.y);
}
/** Fx (1/1000 tile) → tiles. */
export function fxToGrid(fx: number): number {
  return fx / FX_PER_TILE;
}
/** Tiles → Fx; the single rounding towards the sim. */
export function gridToFx(g: number): number {
  return Math.round(g * FX_PER_TILE);
}
/** A circle of `radiusFx` projects to an ellipse: rx = r·64·√2, ry = rx/2. */
export function ellipseForRadius(radiusFx: number): { rx: number; ry: number } {
  const rx = (radiusFx / FX_PER_TILE) * HALF_W * Math.SQRT2;
  return { rx, ry: rx / 2 };
}
/**
 * Interpolated position of a slot in Fx (ADR-006 §3.7) written into `out` (no allocation).
 * No interpolation when |pos − prev| > MAX_INTERP_JUMP_FX on either axis (spawn / teleport).
 */
export function interpolatedInto(out: Vec2, view: SnapshotView, slot: number, alpha: number): Vec2 {
  const px = view.prevX[slot] ?? 0;
  const py = view.prevY[slot] ?? 0;
  const x = view.posX[slot] ?? 0;
  const y = view.posY[slot] ?? 0;
  const dx = x - px;
  const dy = y - py;
  if (
    dx > MAX_INTERP_JUMP_FX ||
    dx < -MAX_INTERP_JUMP_FX ||
    dy > MAX_INTERP_JUMP_FX ||
    dy < -MAX_INTERP_JUMP_FX
  ) {
    out.x = x;
    out.y = y;
  } else {
    out.x = px + dx * alpha;
    out.y = py + dy * alpha;
  }
  return out;
}
/** Allocating convenience wrapper of `interpolatedInto`. */
export function interpolatedPos(view: SnapshotView, slot: number, alpha: number): Vec2 {
  return interpolatedInto({ x: 0, y: 0 }, view, slot, alpha);
}
/** alpha = clamp((now − arrival) / tickIntervalMs, 0, 1) (ADR-006 §3.7). */
export function interpolationAlpha(
  nowMs: number,
  arrivalMs: number,
  tickIntervalUs: number,
): number {
  const ms = tickIntervalUs / 1000;
  if (!(ms > 0)) return 1;
  const a = (nowMs - arrivalMs) / ms;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}
