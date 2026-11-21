// ADR-006 §7.4 — minimap ↔ grid mapping. PURE. Owner: render-engineer (2nd) (R7).
import type { Vec2 } from '../types';

export function minimapToGrid(
  _mx: number,
  _my: number,
  _mapW: number,
  _mapH: number,
  _mmW: number,
  _mmH: number,
): Vec2 {
  throw new Error('TODO(R7): minimapToGrid');
}
export function gridToMinimap(
  _gx: number,
  _gy: number,
  _mapW: number,
  _mapH: number,
  _mmW: number,
  _mmH: number,
): Vec2 {
  throw new Error('TODO(R7): gridToMinimap');
}
