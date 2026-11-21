// Shared pure types for render/ and input/ (no Pixi, no DOM).
export type ZoomIndex = 0 | 1 | 2;

/**
 * Anchor of an in-flight zoom (ADR-006 §4.2, amended): the world point (`wx`,`wy`) stays under the
 * cursor, which sits `dx`,`dy` px from the viewport centre. Stored as an offset so `stepZoom` needs no viewport.
 */
export interface ZoomAnchor {
  dx: number;
  dy: number;
  wx: number;
  wy: number;
}

/** ADR-006 §4.2. `x,y` = centre in world px; `zoomT` = animated effective zoom. */
export interface Camera {
  x: number;
  y: number;
  zoomIndex: ZoomIndex;
  zoomT: number;
  /** Set by `setZoomAnchored`, cleared by `stepZoom` when the zoom settles. */
  anchor?: ZoomAnchor | null;
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

/** Inclusive tile (or chunk) range; empty when x1 < x0 or y1 < y0. */
export interface TileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
