// ADR-006 §4.3 — culling. PURE. Owner: render-engineer (R1).
import { CHUNK_TILES } from './constants';
import { screenToGrid } from './iso';
import type { Camera, TileRange, Viewport } from './types';

/** Sprite frame (px at zoom 1) and foot anchor (ADR-006 §4.7), and extra margin (§4.3). */
export const SPRITE_W = 64;
export const SPRITE_H = 96;
export const SPRITE_ANCHOR_Y = 0.88;
export const SPRITE_CULL_MARGIN_PX = 16;

const CHUNK_SHIFT = 4; // log2(CHUNK_TILES)
if (1 << CHUNK_SHIFT !== CHUNK_TILES) throw new Error('CHUNK_TILES must be 16');

/**
 * Conservative superset of the visible tiles, clipped to the map. Inclusive tile indices;
 * empty (x1 < x0) if the viewport does not touch the map.
 */
export function visibleTileRange(
  cam: Camera,
  vp: Viewport,
  mapW: number,
  mapH: number,
  marginTiles: number,
): TileRange {
  const a = screenToGrid(cam, vp, 0, 0);
  const b = screenToGrid(cam, vp, vp.vw, 0);
  const c = screenToGrid(cam, vp, 0, vp.vh);
  const d = screenToGrid(cam, vp, vp.vw, vp.vh);
  const minX = Math.min(a.x, b.x, c.x, d.x);
  const maxX = Math.max(a.x, b.x, c.x, d.x);
  const minY = Math.min(a.y, b.y, c.y, d.y);
  const maxY = Math.max(a.y, b.y, c.y, d.y);
  return {
    x0: Math.max(0, Math.floor(minX) - marginTiles),
    y0: Math.max(0, Math.floor(minY) - marginTiles),
    x1: Math.min(mapW - 1, Math.floor(maxX) + marginTiles),
    y1: Math.min(mapH - 1, Math.floor(maxY) + marginTiles),
  };
}
/** Chunk range (CHUNK_TILES) covering a tile range; empty in → empty out. */
export function visibleChunks(range: TileRange): TileRange {
  if (range.x1 < range.x0 || range.y1 < range.y0) return { x0: 0, y0: 0, x1: -1, y1: -1 };
  return {
    x0: range.x0 >> CHUNK_SHIFT,
    y0: range.y0 >> CHUNK_SHIFT,
    x1: range.x1 >> CHUNK_SHIFT,
    y1: range.y1 >> CHUNK_SHIFT,
  };
}
/** True if a sprite (64×96 px × zoom, anchored at the foot, +16 px margin) intersects the viewport. */
export function spriteVisible(sx: number, sy: number, zoom: number, vp: Viewport): boolean {
  const m = SPRITE_CULL_MARGIN_PX;
  const left = sx - (SPRITE_W / 2) * zoom - m;
  const right = sx + (SPRITE_W / 2) * zoom + m;
  const top = sy - SPRITE_H * SPRITE_ANCHOR_Y * zoom - m;
  const bottom = sy + SPRITE_H * (1 - SPRITE_ANCHOR_Y) * zoom + m;
  return right >= 0 && left <= vp.vw && bottom >= 0 && top <= vp.vh;
}
