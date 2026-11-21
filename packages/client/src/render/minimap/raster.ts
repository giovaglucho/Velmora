// ADR-006 §7.4 — pure pixel helpers of the minimap (no DOM): they work on RGBA byte arrays so that Node
// tests can check them; `minimap.ts` only blits the result into a Canvas2D.
import { FOG_EXPLORED, FOG_VISIBLE } from '../fog/visionGrid';
import { minimapToGrid } from './mapping';

/** Fog overlay colour (RGB bytes) and alpha (0..255) per FOG_* state: unexplored, explored, visible. */
export const MINIMAP_FOG_RGB = [5, 8, 13] as const;
export const MINIMAP_FOG_ALPHA = [255, 140, 0] as const;

/** For every minimap pixel the index of the tile under it (ty·W + tx) or -1 outside the map diamond. */
export function buildTileIndex(mapW: number, mapH: number, mmW: number, mmH: number): Int32Array {
  const out = new Int32Array(mmW * mmH).fill(-1);
  for (let y = 0; y < mmH; y++)
    for (let x = 0; x < mmW; x++) {
      const g = minimapToGrid(x + 0.5, y + 0.5, mapW, mapH, mmW, mmH);
      const tx = Math.floor(g.x);
      const ty = Math.floor(g.y);
      if (tx >= 0 && ty >= 0 && tx < mapW && ty < mapH) out[y * mmW + x] = ty * mapW + tx;
    }
  return out;
}

/** Terrain base layer, rasterised once: `rgbOf(tileIndex)` = 0xRRGGBB. Pixels outside the diamond stay transparent. */
export function rasterTerrain(
  tileIndex: Int32Array,
  rgbOf: (tile: number) => number,
  out: Uint8ClampedArray,
): void {
  for (let p = 0; p < tileIndex.length; p++) {
    const t = tileIndex[p] as number;
    const o = p * 4;
    if (t < 0) {
      out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
      continue;
    }
    const c = rgbOf(t);
    out[o] = (c >> 16) & 255;
    out[o + 1] = (c >> 8) & 255;
    out[o + 2] = c & 255;
    out[o + 3] = 255;
  }
}

/** base RGBA + fog states (FOG_* per tile) -> out RGBA. `fog = null` copies the base. */
export function applyFog(
  base: Uint8ClampedArray,
  tileIndex: Int32Array,
  fog: Uint8Array | null,
  out: Uint8ClampedArray,
): void {
  if (fog === null) {
    out.set(base);
    return;
  }
  const [fr, fg, fb] = MINIMAP_FOG_RGB;
  for (let p = 0; p < tileIndex.length; p++) {
    const t = tileIndex[p] as number;
    const o = p * 4;
    if (t < 0) {
      out[o + 3] = 0;
      continue;
    }
    const s = fog[t] ?? 0;
    if (s === FOG_VISIBLE) {
      out[o] = base[o] as number;
      out[o + 1] = base[o + 1] as number;
      out[o + 2] = base[o + 2] as number;
    } else {
      // s: 0 unexplored, 1 explored (FOG_EXPLORED) -> blend towards the fog colour.
      const a = MINIMAP_FOG_ALPHA[s === FOG_EXPLORED ? 1 : 0] as number;
      const ia = 255 - a;
      out[o] = (((base[o] as number) * ia + fr * a) / 255) | 0;
      out[o + 1] = (((base[o + 1] as number) * ia + fg * a) / 255) | 0;
      out[o + 2] = (((base[o + 2] as number) * ia + fb * a) / 255) | 0;
    }
    out[o + 3] = 255;
  }
}
