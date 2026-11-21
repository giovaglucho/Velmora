// Seam metric of ADR-006 §4.6 ("sin bordes de tile visibles"): gradient energy sampled along the projected
// tile / chunk border lines vs parallel lines shifted half a tile. ratio ≤ 1.15 ⇒ no visible seams.
import type { PNG } from 'pngjs';

export interface SeamCamera {
  /** Grid position (tiles) at the viewport centre. */
  gx: number;
  gy: number;
  zoom: number;
  vw: number;
  vh: number;
}
export interface SeamResult {
  tileLines: number;
  shiftedLines: number;
  chunkLines: number;
  otherTileLines: number;
  /** mean energy on integer grid lines / on lines shifted by half a tile. */
  ratioTile: number;
  /** mean energy on chunk borders (multiples of 16) / on the remaining tile lines. */
  ratioChunk: number;
  samples: number;
}

function lum(png: PNG, x: number, y: number): number {
  const i = (y * png.width + x) * 4;
  return (
    0.299 * (png.data[i] ?? 0) + 0.587 * (png.data[i + 1] ?? 0) + 0.114 * (png.data[i + 2] ?? 0)
  );
}
function energy(png: PNG, x: number, y: number): number {
  return (
    Math.abs(lum(png, x + 1, y) - lum(png, x - 1, y)) +
    Math.abs(lum(png, x, y + 1) - lum(png, x, y - 1))
  );
}

export function seamMetric(png: PNG, cam: SeamCamera, mapW: number, mapH: number): SeamResult {
  const cwx = (cam.gx - cam.gy) * 64;
  const cwy = (cam.gx + cam.gy) * 32;
  const toScreen = (gx: number, gy: number) => ({
    x: ((gx - gy) * 64 - cwx) * cam.zoom + cam.vw / 2,
    y: ((gx + gy) * 32 - cwy) * cam.zoom + cam.vh / 2,
  });
  // energy accumulators: tile lines (non-chunk), chunk lines, shifted lines (+0.5)
  const acc = { tile: [0, 0], chunk: [0, 0], shifted: [0, 0] } as Record<string, [number, number]>;
  const lines = { tile: 0, chunk: 0, shifted: 0 };
  const step = 0.02;
  const margin = 4;
  const sampleLine = (fixed: number, axis: 'x' | 'y', key: 'tile' | 'chunk' | 'shifted') => {
    let any = false;
    const lim = axis === 'x' ? mapH : mapW;
    for (let t = 1; t < lim - 1; t += step) {
      const p = axis === 'x' ? toScreen(fixed, t) : toScreen(t, fixed);
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      if (px < margin || py < margin || px >= png.width - margin || py >= png.height - margin)
        continue;
      acc[key]![0] += energy(png, px, py);
      acc[key]![1]++;
      any = true;
    }
    if (any) lines[key]++;
  };
  for (let k = 2; k < Math.max(mapW, mapH) - 2; k++) {
    for (const axis of ['x', 'y'] as const) {
      const lim = axis === 'x' ? mapW : mapH;
      if (k >= lim - 2) continue;
      sampleLine(k, axis, k % 16 === 0 ? 'chunk' : 'tile');
      sampleLine(k + 0.5, axis, 'shifted');
    }
  }
  const mean = (a: [number, number]) => a[0] / Math.max(1, a[1]);
  return {
    tileLines: lines.tile + lines.chunk,
    shiftedLines: lines.shifted,
    chunkLines: lines.chunk,
    otherTileLines: lines.tile,
    ratioTile:
      (acc.tile![0] + acc.chunk![0]) /
      Math.max(1, acc.tile![1] + acc.chunk![1]) /
      mean(acc.shifted!),
    ratioChunk: mean(acc.chunk!) / mean(acc.tile!),
    samples: acc.tile![1] + acc.chunk![1] + acc.shifted![1],
  };
}
