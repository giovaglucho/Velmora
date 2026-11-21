// ADR-006 §4.1 — structural constants (GDD §15.4). Not balance values.
export const TILE_W = 128;
export const TILE_H = 64;
export const HALF_W = 64;
export const HALF_H = 32;
export const ZOOMS = [0.6, 1, 1.4] as const;
export const CHUNK_TILES = 16;
/** px per elevation level at zoom 1 (F2: all terrain at level 0). */
export const ELEV_PX = 16;
/** ADR-006 §3.7: above this |pos-prev| (Fx, any axis) the interpolation is skipped. */
export const MAX_INTERP_JUMP_FX = 4000;
export const TERRAIN_TEX_PERIOD_TILES = 4;
export const FOG_FADE_PER_S = 6.0;
/** Provisional player colours (RGB 0xRRGGBB), 8 entries. */
export const PLAYER_COLORS: readonly number[] = [
  0x3b82f6, 0xef4444, 0x22c55e, 0xeab308, 0xa855f7, 0x06b6d4, 0xf97316, 0xec4899,
];
