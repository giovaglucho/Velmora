// ADR-006 §4.6 — client-side (non-authoritative) terrain data. PURE. Owner: render-engineer (R2).
export type TerrainKind = 0 | 1 | 2 | 3; // grass, dirt, sand, rock/ash

export interface TerrainMap {
  readonly width: number;
  readonly height: number;
  /** length W*H */
  readonly kind: Uint8Array;
  /** (W+1)*(H+1)*4 RGBA8: per-vertex layer weights. */
  readonly splat: Uint8Array;
}

export function buildTerrainMap(
  _width: number,
  _height: number,
  _blockedRle: unknown,
  _seed: number,
): TerrainMap {
  throw new Error('TODO(R2): buildTerrainMap');
}
