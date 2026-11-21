// Map generators and independent reference algorithms for the grid / path tests.
import { createPrng } from '@reinos/shared';
import { createGrid, type GridImpl } from '../../src/index';

/** Random obstacle map from a seed: `density` is the percentage of blocked tiles (clustered). */
export function randomGrid(w: number, h: number, seed: number, density: number): GridImpl {
  const rng = createPrng(seed);
  const g = createGrid(w, h);
  const target = Math.trunc((w * h * density) / 100);
  let placed = 0;
  while (placed < target) {
    const bw = 1 + rng.nextInt(4);
    const bh = 1 + rng.nextInt(4);
    const bx = rng.nextInt(w);
    const by = rng.nextInt(h);
    for (let y = by; y < Math.min(by + bh, h); y++)
      for (let x = bx; x < Math.min(bx + bw, w); x++)
        if (g.terrain[y * w + x] === 0) {
          g.terrain[y * w + x] = 1;
          placed++;
        }
  }
  g.markAllDirty();
  return g;
}

/** Builds a grid from ASCII rows ('#' blocked, anything else free). */
export function gridFromAscii(rows: string[]): GridImpl {
  const g = createGrid(rows[0]!.length, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') g.terrain[y * g.width + x] = 1;
  });
  g.markAllDirty();
  return g;
}

export interface RefGrid {
  width: number;
  height: number;
  isBlocked(x: number, y: number): boolean;
}

/** Plain 4-connected flood fill labelling (== 8-connected without corner cutting). */
export function floodLabels(g: RefGrid): Int32Array {
  const lab = new Int32Array(g.width * g.height).fill(-1);
  let next = 0;
  for (let i = 0; i < lab.length; i++) {
    const x0 = i % g.width;
    const y0 = Math.floor(i / g.width);
    if (lab[i] !== -1 || g.isBlocked(x0, y0)) continue;
    const st = [i];
    lab[i] = next;
    while (st.length) {
      const c = st.pop()!;
      const cx = c % g.width;
      const cy = Math.floor(c / g.width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (g.isBlocked(nx, ny)) continue;
        const ni = ny * g.width + nx;
        if (lab[ni] !== -1) continue;
        lab[ni] = next;
        st.push(ni);
      }
    }
    next++;
  }
  return lab;
}

/** Reference shortest path cost: Dial's bucket algorithm (independent of the sim's heap), 10/14. */
export function refCost(g: RefGrid, s: number, t: number): number {
  const n = g.width * g.height;
  const dist = new Array<number>(n).fill(Infinity);
  const buckets: number[][] = [];
  const push = (d: number, i: number): void => {
    (buckets[d] ??= []).push(i);
  };
  dist[s] = 0;
  push(0, s);
  for (let d = 0; d < buckets.length; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (let q = 0; q < bucket.length; q++) {
      const u = bucket[q]!;
      if (dist[u]! !== d) continue;
      if (u === t) return d;
      const ux = u % g.width;
      const uy = Math.floor(u / g.width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = ux + dx;
          const ny = uy + dy;
          if (g.isBlocked(nx, ny)) continue;
          if (dx !== 0 && dy !== 0 && (g.isBlocked(ux + dx, uy) || g.isBlocked(ux, uy + dy)))
            continue;
          const ni = ny * g.width + nx;
          const nd = d + (dx !== 0 && dy !== 0 ? 14 : 10);
          if (nd < dist[ni]!) {
            dist[ni] = nd;
            push(nd, ni);
          }
        }
    }
  }
  return -1;
}

export const octileRef = (dx: number, dy: number): number => {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return 10 * Math.max(ax, ay) + 4 * Math.min(ax, ay);
};

/** Octile cost of a polyline of fixed-point points (Fx -> tiles as floats; rounded per segment). */
export function polylineCost(pts: { x: number; y: number }[]): number {
  let c = 0;
  for (let i = 1; i < pts.length; i++)
    c += octileRef((pts[i]!.x - pts[i - 1]!.x) / 1000, (pts[i]!.y - pts[i - 1]!.y) / 1000);
  return c;
}

/** Independent segment check by dense sampling: every sampled point must lie in a free tile. */
export function segmentClear(g: RefGrid, ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.max(
    1,
    Math.ceil((Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / 1000) * 64),
  );
  for (let k = 0; k <= steps; k++) {
    const x = ax + ((bx - ax) * k) / steps;
    const y = ay + ((by - ay) * k) / steps;
    if (g.isBlocked(Math.floor(x / 1000), Math.floor(y / 1000))) return false;
  }
  return true;
}
