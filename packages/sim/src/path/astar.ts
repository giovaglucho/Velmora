// Tile-level search (ADR-005 §10): A* with 8 neighbours, no corner cutting, costs 10/14, octile
// heuristic, total order (f, h, index). Also a sector-bounded Dijkstra used by the sector graph.
import { createHeap, type Heap } from './heap';
import type { Grid } from '../systems';

export const COST_ORTHO = 10;
export const COST_DIAG = 14;
export const INF = 0x3fffffff;

// Neighbour order is fixed: N, E, S, W, NE, SE, SW, NW (y grows southwards).
export const NDX = new Int8Array([0, 1, 0, -1, 1, 1, -1, -1]);
export const NDY = new Int8Array([-1, 0, 1, 0, -1, 1, 1, -1]);

export function octile(dx: number, dy: number): number {
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  return ax > ay ? COST_ORTHO * ax + 4 * ay : COST_ORTHO * ay + 4 * ax;
}

export interface TileSearch {
  /**
   * A* from startIdx to goalIdx restricted to the tile box [x0,x1) x [y0,y1). Writes the tiles
   * after the start up to and including the goal at out[off..off+n) and returns n, or -1 if the
   * goal is unreachable inside the box. Returns 0 when start === goal. Cost of the last search
   * is in `lastCost`.
   */
  search(
    startIdx: number,
    goalIdx: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    out: Int32Array,
    off: number,
  ): number;
  lastCost: number;
  /** Nodes expanded since creation (diagnostics only; not state). */
  expanded: number;
}

export function createTileSearch(grid: Grid): TileSearch {
  const { width, height, terrain, occ } = grid;
  const n = width * height;
  const g = new Int32Array(n);
  const parent = new Int32Array(n);
  const seen = new Int32Array(n);
  const done = new Int32Array(n);
  const heap: Heap = createHeap(2048);
  let stamp = 0;

  const free = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = y * width + x;
    return ((terrain[i] as number) | (occ[i] as number)) === 0;
  };

  const ts: TileSearch = {
    lastCost: 0,
    expanded: 0,
    search(startIdx, goalIdx, x0, y0, x1, y1, out, off) {
      if (startIdx === goalIdx) {
        ts.lastCost = 0;
        return 0;
      }
      stamp++;
      heap.clear();
      const gy = Math.trunc(goalIdx / width);
      const gx = goalIdx - gy * width;
      const sy = Math.trunc(startIdx / width);
      const sx = startIdx - sy * width;
      g[startIdx] = 0;
      parent[startIdx] = -1;
      seen[startIdx] = stamp;
      heap.push(octile(gx - sx, gy - sy), octile(gx - sx, gy - sy), startIdx);
      let found = false;
      while (heap.size > 0) {
        heap.pop();
        const cur = heap.topId;
        if (done[cur] === stamp) continue;
        done[cur] = stamp;
        if (cur === goalIdx) {
          found = true;
          break;
        }
        ts.expanded++;
        const cy = Math.trunc(cur / width);
        const cx = cur - cy * width;
        const gc = g[cur] as number;
        for (let k = 0; k < 8; k++) {
          const nx = cx + (NDX[k] as number);
          const ny = cy + (NDY[k] as number);
          if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
          if (!free(nx, ny)) continue;
          let cost = COST_ORTHO;
          if (k >= 4) {
            if (!free(nx, cy) || !free(cx, ny)) continue;
            cost = COST_DIAG;
          }
          const ni = ny * width + nx;
          if (done[ni] === stamp) continue;
          const ng = gc + cost;
          if (seen[ni] === stamp && ng >= (g[ni] as number)) continue;
          seen[ni] = stamp;
          g[ni] = ng;
          parent[ni] = cur;
          const h = octile(gx - nx, gy - ny);
          heap.push(ng + h, h, ni);
        }
      }
      if (!found) return -1;
      ts.lastCost = g[goalIdx] as number;
      let len = 0;
      for (let c = goalIdx; c !== startIdx; c = parent[c] as number) len++;
      let p = off + len - 1;
      for (let c = goalIdx; c !== startIdx; c = parent[c] as number) out[p--] = c;
      return len;
    },
  };
  return ts;
}

/**
 * Dijkstra from startIdx inside the tile box [x0,x1) x [y0,y1) (at most 16x16). Writes octile
 * costs into cost[(y - y0) * 16 + (x - x0)] (INF when unreachable). `cost` has 256 entries.
 */
export function boxDijkstra(
  grid: Grid,
  heap: Heap,
  startIdx: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cost: Int32Array,
): void {
  const { width, height, terrain, occ } = grid;
  cost.fill(INF);
  const free = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = y * width + x;
    return ((terrain[i] as number) | (occ[i] as number)) === 0;
  };
  heap.clear();
  const sy = Math.trunc(startIdx / width);
  const sx = startIdx - sy * width;
  const sl = (sy - y0) * 16 + (sx - x0);
  cost[sl] = 0;
  heap.push(0, 0, sl);
  while (heap.size > 0) {
    heap.pop();
    const l = heap.topId;
    const c = heap.topF;
    if (c > (cost[l] as number)) continue;
    const cx = x0 + (l & 15);
    const cy = y0 + (l >> 4);
    for (let k = 0; k < 8; k++) {
      const nx = cx + (NDX[k] as number);
      const ny = cy + (NDY[k] as number);
      if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
      if (!free(nx, ny)) continue;
      let step = COST_ORTHO;
      if (k >= 4) {
        if (!free(nx, cy) || !free(cx, ny)) continue;
        step = COST_DIAG;
      }
      const nl = (ny - y0) * 16 + (nx - x0);
      const nc = c + step;
      if (nc < (cost[nl] as number)) {
        cost[nl] = nc;
        heap.push(nc, 0, nl);
      }
    }
  }
}

/**
 * Line of sight between two points in fixed point over the tile grid (integer supercover DDA).
 * A diagonal pass through a tile corner needs both orthogonal tiles free (no corner cutting).
 */
export function lineOfSight(
  grid: Grid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tile: number,
): boolean {
  const { width, height, terrain, occ } = grid;
  const free = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const i = y * width + x;
    return ((terrain[i] as number) | (occ[i] as number)) === 0;
  };
  let cx = Math.trunc(ax / tile);
  let cy = Math.trunc(ay / tile);
  const ex = Math.trunc(bx / tile);
  const ey = Math.trunc(by / tile);
  if (!free(cx, cy)) return false;
  const dx = bx - ax;
  const dy = by - ay;
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  // distance (in fixed point) from the point to the next vertical / horizontal tile boundary
  let nx = dx < 0 ? ax - cx * tile : (cx + 1) * tile - ax;
  let ny = dy < 0 ? ay - cy * tile : (cy + 1) * tile - ay;
  while (cx !== ex || cy !== ey) {
    if (cy === ey) {
      cx += sx;
      nx += tile;
    } else if (cx === ex) {
      cy += sy;
      ny += tile;
    } else {
      // time to the next vertical boundary (nx / adx) vs the next horizontal one (ny / ady)
      const lhs = nx * ady;
      const rhs = ny * adx;
      if (lhs < rhs) {
        cx += sx;
        nx += tile;
      } else if (rhs < lhs) {
        cy += sy;
        ny += tile;
      } else {
        // exact corner crossing: both orthogonal tiles must be free (no corner cutting)
        if (!free(cx + sx, cy) || !free(cx, cy + sy)) return false;
        cx += sx;
        cy += sy;
        nx += tile;
        ny += tile;
      }
    }
    if (!free(cx, cy)) return false;
  }
  return true;
}
