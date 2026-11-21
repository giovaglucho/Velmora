// Shared pure types for render/ and input/ (no Pixi, no DOM).
export type ZoomIndex = 0 | 1 | 2;

/** ADR-006 §4.2. `x,y` = centre in world px; `zoomT` = animated effective zoom. */
export interface Camera {
  x: number;
  y: number;
  zoomIndex: ZoomIndex;
  zoomT: number;
}

/** Viewport in CSS px. */
export interface Viewport {
  vw: number;
  vh: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface TileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
