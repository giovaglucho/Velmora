// ADR-006 §4.1 — isometric 2:1 projection. PURE: no Pixi, no DOM, no time. Owner: render-engineer (R1).
import type { Camera, Vec2, Viewport } from './types';
import type { SnapshotView } from '../worker/snapshot';

/** Grid (tiles, float) → world px at zoom 1. `h` = elevation levels. */
export function gridToWorld(_gx: number, _gy: number, _h?: number): Vec2 {
  throw new Error('TODO(R1): gridToWorld');
}
/** Inverse for h = 0. */
export function worldToGrid(_wx: number, _wy: number): Vec2 {
  throw new Error('TODO(R1): worldToGrid');
}
export function worldToScreen(_cam: Camera, _vp: Viewport, _wx: number, _wy: number): Vec2 {
  throw new Error('TODO(R1): worldToScreen');
}
export function screenToWorld(_cam: Camera, _vp: Viewport, _sx: number, _sy: number): Vec2 {
  throw new Error('TODO(R1): screenToWorld');
}
export function screenToGrid(_cam: Camera, _vp: Viewport, _sx: number, _sy: number): Vec2 {
  throw new Error('TODO(R1): screenToGrid');
}
/** Fx (1/1000 tile) → tiles. */
export function fxToGrid(_fx: number): number {
  throw new Error('TODO(R1): fxToGrid');
}
/** Tiles → Fx; the single rounding towards the sim. */
export function gridToFx(_g: number): number {
  throw new Error('TODO(R1): gridToFx');
}
/** A circle of `radiusFx` projects to an ellipse: rx = r·64·√2, ry = rx/2. */
export function ellipseForRadius(_radiusFx: number): { rx: number; ry: number } {
  throw new Error('TODO(R1): ellipseForRadius');
}
/** Interpolated position of a slot in Fx (ADR-006 §3.7); no jump interpolation above MAX_INTERP_JUMP_FX. */
export function interpolatedPos(_view: SnapshotView, _slot: number, _alpha: number): Vec2 {
  throw new Error('TODO(R1): interpolatedPos');
}
