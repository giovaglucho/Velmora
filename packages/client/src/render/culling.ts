// ADR-006 §4.3 — culling. PURE. Owner: render-engineer (R1).
import type { Camera, TileRange, Viewport } from './types';

/** Conservative superset of the visible tiles, clipped to the map. */
export function visibleTileRange(
  _cam: Camera,
  _vp: Viewport,
  _mapW: number,
  _mapH: number,
  _marginTiles: number,
): TileRange {
  throw new Error('TODO(R1): visibleTileRange');
}
/** Chunk range (CHUNK_TILES) covering a tile range. */
export function visibleChunks(_range: TileRange): TileRange {
  throw new Error('TODO(R1): visibleChunks');
}
/** True if a sprite (64×96 px × zoom, anchored at the foot, +16 px margin) intersects the viewport. */
export function spriteVisible(_sx: number, _sy: number, _zoom: number, _vp: Viewport): boolean {
  throw new Error('TODO(R1): spriteVisible');
}
