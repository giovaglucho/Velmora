// ADR-006 §7.4 — minimap ↔ grid mapping. PURE. Owner: render-engineer (2nd) (R7).
//
// The isometric 2:1 map diamond (world x ∈ [-H·64, W·64], y ∈ [0, (W+H)·32]) always has a 2:1 bounding box,
// so it fills a 2:1 minimap exactly (256×128) for any map size:
//   mx = (gx - gy + H) / (W + H) · mmW        my = (gx + gy) / (W + H) · mmH
// Grid coordinates are in tiles (float); the diamond vertices are (0,0) top, (W,0) right, (W,H) bottom, (0,H) left.
import type { Vec2 } from '../types';

export function gridToMinimap(
  gx: number,
  gy: number,
  mapW: number,
  mapH: number,
  mmW: number,
  mmH: number,
): Vec2 {
  const n = mapW + mapH;
  return { x: ((gx - gy + mapH) / n) * mmW, y: ((gx + gy) / n) * mmH };
}

export function minimapToGrid(
  mx: number,
  my: number,
  mapW: number,
  mapH: number,
  mmW: number,
  mmH: number,
): Vec2 {
  const n = mapW + mapH;
  const a = (mx / mmW) * n; // gx - gy + H
  const b = (my / mmH) * n; // gx + gy
  return { x: (a - mapH + b) / 2, y: (b - a + mapH) / 2 };
}

/** Clamps a grid point to the map rectangle [0, W] × [0, H] (clicks in the transparent corners of the minimap). */
export function clampGrid(gx: number, gy: number, mapW: number, mapH: number): Vec2 {
  return { x: Math.min(mapW, Math.max(0, gx)), y: Math.min(mapH, Math.max(0, gy)) };
}
