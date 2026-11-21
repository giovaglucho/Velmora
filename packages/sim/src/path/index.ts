// Pathfinder (ADR-005 §10): flat A* for nearby queries, hierarchical search over the sector
// graph for far ones, string-pulling smoothing, component labelling for exact reachability and
// transparent caches. Nothing here is simulation state: clearCaches() must not change any result.
import { TILE_FX, clamp, fxToTile, tileCenterFx, type Fx } from '@reinos/shared';
import { MAX_WAYPOINTS } from '../ecs/world';
import { SECTOR_SHIFT, SECTOR_SIZE } from '../grid/grid';
import type { Grid } from '../systems';
import { INF, boxDijkstra, createTileSearch, lineOfSight, octile } from './astar';
import { createHeap } from './heap';
import { MAX_EDGES, createSectorGraph, type SectorGraph } from './sectors';

export const PATH_NONE = 0;
export const PATH_OK = 1;
export const PATH_PARTIAL = 2;
export const PATH_TRUNCATED = 3;

export {
  MAX_EDGES,
  NODES_PER_SECTOR,
  PORTALS_PER_SECTOR,
  createSectorGraph,
  type SectorGraph,
} from './sectors';
export { createHeap, type Heap } from './heap';
export { createTileSearch, lineOfSight, octile, type TileSearch } from './astar';

export interface PathQuery {
  startX: Fx;
  startY: Fx;
  goalX: Fx;
  goalY: Fx;
}

export interface PathResult {
  status: number;
  count: number;
  x: Int32Array;
  y: Int32Array;
}

export interface Pathfinder {
  findPath(q: PathQuery, out: PathResult): void;
  clearCaches(): void;
  /** Diagnostics only; not state, never hashed. */
  readonly stats: { queries: number; cacheHits: number; expandedNodes: number };
  readonly graph: SectorGraph;
}

export function createPathResult(): PathResult {
  return {
    status: PATH_NONE,
    count: 0,
    x: new Int32Array(MAX_WAYPOINTS),
    y: new Int32Array(MAX_WAYPOINTS),
  };
}

const CACHE_SLOTS = 64;
const PARTIAL_SLOTS = 16;
/** Queries whose sectors are at most this far apart (Chebyshev) use the flat search. */
const FLAT_SECTOR_DISTANCE = 2;

export function createPathfinder(grid: Grid): Pathfinder {
  const { width, height, terrain, occ, sectorsX } = grid;
  const n = width * height;
  const graph = createSectorGraph(grid);
  const ts = createTileSearch(grid);
  const heap = createHeap(1024);
  const stats = { queries: 0, cacheHits: 0, expandedNodes: 0 };
  const maxFxX = width * TILE_FX - 1;
  const maxFxY = height * TILE_FX - 1;

  // ---- connected components (4-connectivity == 8-connectivity without corner cutting) -------
  const comp = new Int32Array(n);
  const compSize = new Int32Array(n + 1);
  const stack = new Int32Array(n);
  let compVersion = -1;
  const ensureComponents = (): void => {
    if (compVersion === grid.version) return;
    comp.fill(-1);
    let nc = 0;
    for (let i = 0; i < n; i++) {
      if (((terrain[i] as number) | (occ[i] as number)) !== 0 || (comp[i] as number) >= 0) continue;
      let sp = 0;
      let size = 0;
      stack[sp++] = i;
      comp[i] = nc;
      while (sp > 0) {
        const c = stack[--sp] as number;
        size++;
        const cy = Math.trunc(c / width);
        const cx = c - cy * width;
        for (let k = 0; k < 4; k++) {
          const nx = cx + (k === 1 ? 1 : k === 3 ? -1 : 0);
          const ny = cy + (k === 2 ? 1 : k === 0 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (((terrain[ni] as number) | (occ[ni] as number)) !== 0 || (comp[ni] as number) >= 0)
            continue;
          comp[ni] = nc;
          stack[sp++] = ni;
        }
      }
      compSize[nc] = size;
      nc++;
    }
    compVersion = grid.version;
  };

  // closest tile of a component to a goal tile (octile, ties: lowest index), small cache
  const pKeyComp = new Int32Array(PARTIAL_SLOTS).fill(-1);
  const pKeyGoal = new Int32Array(PARTIAL_SLOTS);
  const pKeyVer = new Int32Array(PARTIAL_SLOTS);
  const pVal = new Int32Array(PARTIAL_SLOTS);
  const partialTarget = (c: number, gIdx: number): number => {
    const slot = (Math.imul(c, 31) + gIdx) & (PARTIAL_SLOTS - 1);
    if (pKeyComp[slot] === c && pKeyGoal[slot] === gIdx && pKeyVer[slot] === grid.version)
      return pVal[slot] as number;
    const gy = Math.trunc(gIdx / width);
    const gx = gIdx - gy * width;
    let best = -1;
    let bestD = INF;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (comp[i] !== c) continue;
        const d = octile(gx - x, gy - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    pKeyComp[slot] = c;
    pKeyGoal[slot] = gIdx;
    pKeyVer[slot] = grid.version;
    pVal[slot] = best;
    return best;
  };

  // ---- raw route buffers ---------------------------------------------------------------------
  const rawCap = 2 * n + 2 * SECTOR_SIZE * SECTOR_SIZE;
  const raw = new Int32Array(rawCap);

  // ---- hierarchical search state ------------------------------------------------------------
  const nodeCap = graph.nodeCap;
  const hg = new Int32Array(nodeCap + 1);
  const hParent = new Int32Array(nodeCap + 1);
  const hSeen = new Int32Array(nodeCap + 1);
  const hDone = new Int32Array(nodeCap + 1);
  const chain = new Int32Array(nodeCap + 1);
  const nodesBuf = new Int32Array(32);
  const costS = new Int32Array(256);
  const costG = new Int32Array(256);
  let hStamp = 0;
  const GOAL_NODE = nodeCap;

  const boxX0 = (s: number): number => (s - Math.trunc(s / sectorsX) * sectorsX) << SECTOR_SHIFT;
  const boxY0 = (s: number): number => Math.trunc(s / sectorsX) << SECTOR_SHIFT;

  const legSearch = (a: number, b: number, sec: number, off: number): number => {
    if (off + SECTOR_SIZE * SECTOR_SIZE > rawCap) return -1;
    const x0 = boxX0(sec);
    const y0 = boxY0(sec);
    return ts.search(
      a,
      b,
      x0,
      y0,
      Math.min(x0 + SECTOR_SIZE, width),
      Math.min(y0 + SECTOR_SIZE, height),
      raw,
      off,
    );
  };

  const hpaRoute = (sIdx: number, gIdx: number): number => {
    const sy = Math.trunc(sIdx / width);
    const sx = sIdx - sy * width;
    const gy = Math.trunc(gIdx / width);
    const gx = gIdx - gy * width;
    const zs = graph.grid.sectorOf(sx, sy);
    const zg = graph.grid.sectorOf(gx, gy);
    const sx0 = boxX0(zs);
    const sy0 = boxY0(zs);
    const gx0 = boxX0(zg);
    const gy0 = boxY0(zg);
    boxDijkstra(
      grid,
      heap,
      sIdx,
      sx0,
      sy0,
      Math.min(sx0 + SECTOR_SIZE, width),
      Math.min(sy0 + SECTOR_SIZE, height),
      costS,
    );
    boxDijkstra(
      grid,
      heap,
      gIdx,
      gx0,
      gy0,
      Math.min(gx0 + SECTOR_SIZE, width),
      Math.min(gy0 + SECTOR_SIZE, height),
      costG,
    );
    hStamp++;
    heap.clear();
    const cnt = graph.nodesIn(zs, nodesBuf);
    for (let k = 0; k < cnt; k++) {
      const nd = nodesBuf[k] as number;
      const t = graph.nodeTile[nd] as number;
      const ty = Math.trunc(t / width);
      const tx = t - ty * width;
      const c = costS[((ty - sy0) << 4) + (tx - sx0)] as number;
      if (c >= INF) continue;
      hSeen[nd] = hStamp;
      hg[nd] = c;
      hParent[nd] = -1;
      const h = octile(gx - tx, gy - ty);
      heap.push(c + h, h, nd);
    }
    let gGoal = INF;
    let found = false;
    while (heap.size > 0) {
      heap.pop();
      const id = heap.topId;
      if (id === GOAL_NODE) {
        found = true;
        break;
      }
      if (hDone[id] === hStamp) continue;
      hDone[id] = hStamp;
      stats.expandedNodes++;
      const gc = hg[id] as number;
      if (graph.nodeSector[id] === zg) {
        const t = graph.nodeTile[id] as number;
        const ty = Math.trunc(t / width);
        const tx = t - ty * width;
        const lc = costG[((ty - gy0) << 4) + (tx - gx0)] as number;
        if (lc < INF && gc + lc < gGoal) {
          gGoal = gc + lc;
          hParent[GOAL_NODE] = id;
          heap.push(gGoal, 0, GOAL_NODE);
        }
      }
      const ec = graph.edgeCount[id] as number;
      const base = id * MAX_EDGES;
      for (let e = 0; e < ec; e++) {
        const m = graph.edgeTo[base + e] as number;
        if (hDone[m] === hStamp) continue;
        const ng = gc + (graph.edgeCost[base + e] as number);
        if (hSeen[m] === hStamp && ng >= (hg[m] as number)) continue;
        hSeen[m] = hStamp;
        hg[m] = ng;
        hParent[m] = id;
        const t = graph.nodeTile[m] as number;
        const ty = Math.trunc(t / width);
        const tx = t - ty * width;
        const h = octile(gx - tx, gy - ty);
        heap.push(ng + h, h, m);
      }
    }
    if (!found) return -1;
    let m = 0;
    for (let nd = hParent[GOAL_NODE] as number; nd >= 0; nd = hParent[nd] as number) m++;
    let p = m - 1;
    for (let nd = hParent[GOAL_NODE] as number; nd >= 0; nd = hParent[nd] as number)
      chain[p--] = nd;
    // refine to tile level, sector by sector
    let off = 0;
    let r = legSearch(sIdx, graph.nodeTile[chain[0] as number] as number, zs, off);
    if (r < 0) return -1;
    off += r;
    for (let i = 1; i < m; i++) {
      const prev = chain[i - 1] as number;
      const nd = chain[i] as number;
      if (nd === (prev ^ 1)) {
        raw[off++] = graph.nodeTile[nd] as number;
      } else {
        r = legSearch(
          graph.nodeTile[prev] as number,
          graph.nodeTile[nd] as number,
          graph.nodeSector[prev] as number,
          off,
        );
        if (r < 0) return -1;
        off += r;
      }
    }
    r = legSearch(graph.nodeTile[chain[m - 1] as number] as number, gIdx, zg, off);
    if (r < 0) return -1;
    return off + r;
  };

  const route = (sIdx: number, gIdx: number): number => {
    const sy = Math.trunc(sIdx / width);
    const sx = sIdx - sy * width;
    const gy = Math.trunc(gIdx / width);
    const gx = gIdx - gy * width;
    const dsx = Math.abs((sx >> SECTOR_SHIFT) - (gx >> SECTOR_SHIFT));
    const dsy = Math.abs((sy >> SECTOR_SHIFT) - (gy >> SECTOR_SHIFT));
    if (Math.max(dsx, dsy) <= FLAT_SECTOR_DISTANCE) {
      const x0 = Math.max((Math.min(sx, gx) >> SECTOR_SHIFT) - 1, 0) << SECTOR_SHIFT;
      const y0 = Math.max((Math.min(sy, gy) >> SECTOR_SHIFT) - 1, 0) << SECTOR_SHIFT;
      const x1 = Math.min(((Math.max(sx, gx) >> SECTOR_SHIFT) + 2) << SECTOR_SHIFT, width);
      const y1 = Math.min(((Math.max(sy, gy) >> SECTOR_SHIFT) + 2) << SECTOR_SHIFT, height);
      const r = ts.search(sIdx, gIdx, x0, y0, x1, y1, raw, 0);
      if (r >= 0) return r;
    } else {
      const r = hpaRoute(sIdx, gIdx);
      if (r >= 0) return r;
    }
    return ts.search(sIdx, gIdx, 0, 0, width, height, raw, 0);
  };

  // ---- smoothing (string pulling by visibility, galloping + bisection) ------------------------
  let goalPX = 0;
  let goalPY = 0;
  const ptX = (j: number, last: number): number =>
    j === last ? goalPX : tileCenterFx((raw[j] as number) % width);
  const ptY = (j: number, last: number): number =>
    j === last ? goalPY : tileCenterFx(Math.trunc((raw[j] as number) / width));

  const smooth = (startPX: number, startPY: number, rawN: number, out: PathResult): boolean => {
    const last = rawN - 1;
    let ax = startPX;
    let ay = startPY;
    let i = 0;
    let outN = 0;
    while (i < rawN) {
      if (outN === MAX_WAYPOINTS) {
        out.count = outN;
        return true;
      }
      let lo = i;
      let hi = rawN;
      let step = 1;
      while (lo + step < hi) {
        const j = lo + step;
        if (lineOfSight(grid, ax, ay, ptX(j, last), ptY(j, last), TILE_FX)) {
          lo = j;
          step <<= 1;
        } else {
          hi = j;
          break;
        }
      }
      while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (lineOfSight(grid, ax, ay, ptX(mid, last), ptY(mid, last), TILE_FX)) lo = mid;
        else hi = mid;
      }
      ax = ptX(lo, last);
      ay = ptY(lo, last);
      out.x[outN] = ax;
      out.y[outN] = ay;
      outN++;
      i = lo + 1;
    }
    out.count = outN;
    return false;
  };

  // ---- result cache (exact key: both endpoints + grid version; so it is fully transparent) ----
  const cKeyA = new Int32Array(CACHE_SLOTS);
  const cKeyB = new Int32Array(CACHE_SLOTS);
  const cKeyC = new Int32Array(CACHE_SLOTS);
  const cKeyD = new Int32Array(CACHE_SLOTS);
  const cVer = new Int32Array(CACHE_SLOTS).fill(-1);
  const cStatus = new Uint8Array(CACHE_SLOTS);
  const cCount = new Uint8Array(CACHE_SLOTS);
  const cX = new Int32Array(CACHE_SLOTS * MAX_WAYPOINTS);
  const cY = new Int32Array(CACHE_SLOTS * MAX_WAYPOINTS);
  const slotOf = (q: PathQuery): number =>
    (Math.imul(q.startX, 73856093) ^
      Math.imul(q.startY, 19349663) ^
      Math.imul(q.goalX, 83492791) ^
      Math.imul(q.goalY, 2654435761)) >>>
    26; // top 6 bits: 64 slots

  const findPath = (q: PathQuery, out: PathResult): void => {
    stats.queries++;
    const slot = slotOf(q);
    if (
      cVer[slot] === grid.version &&
      cKeyA[slot] === q.startX &&
      cKeyB[slot] === q.startY &&
      cKeyC[slot] === q.goalX &&
      cKeyD[slot] === q.goalY
    ) {
      stats.cacheHits++;
      const c = cCount[slot] as number;
      out.status = cStatus[slot] as number;
      out.count = c;
      out.x.set(cX.subarray(slot * MAX_WAYPOINTS, slot * MAX_WAYPOINTS + c));
      out.y.set(cY.subarray(slot * MAX_WAYPOINTS, slot * MAX_WAYPOINTS + c));
      return;
    }
    compute(q, out);
    cVer[slot] = grid.version;
    cKeyA[slot] = q.startX;
    cKeyB[slot] = q.startY;
    cKeyC[slot] = q.goalX;
    cKeyD[slot] = q.goalY;
    cStatus[slot] = out.status;
    cCount[slot] = out.count;
    for (let k = 0; k < out.count; k++) {
      cX[slot * MAX_WAYPOINTS + k] = out.x[k] as number;
      cY[slot * MAX_WAYPOINTS + k] = out.y[k] as number;
    }
  };

  const cell = { tx: 0, ty: 0 };

  const compute = (q: PathQuery, out: PathResult): void => {
    out.status = PATH_NONE;
    out.count = 0;
    graph.sync();
    ensureComponents();

    // start: clamp into the map; relocate to the nearest free tile if blocked
    const sPX0 = clamp(q.startX, 0, maxFxX);
    const sPY0 = clamp(q.startY, 0, maxFxY);
    let sx = fxToTile(sPX0);
    let sy = fxToTile(sPY0);
    let startPX = sPX0;
    let startPY = sPY0;
    if (grid.isBlocked(sx, sy)) {
      if (!grid.nearestFree(sx, sy, cell)) return;
      sx = cell.tx;
      sy = cell.ty;
      startPX = tileCenterFx(sx);
      startPY = tileCenterFx(sy);
    }
    const gPX0 = clamp(q.goalX, 0, maxFxX);
    const gPY0 = clamp(q.goalY, 0, maxFxY);
    let gx = fxToTile(gPX0);
    let gy = fxToTile(gPY0);
    goalPX = gPX0;
    goalPY = gPY0;
    if (grid.isBlocked(gx, gy)) {
      if (!grid.nearestFree(gx, gy, cell)) return;
      gx = cell.tx;
      gy = cell.ty;
      goalPX = tileCenterFx(gx);
      goalPY = tileCenterFx(gy);
    }
    const sIdx = sy * width + sx;
    let gIdx = gy * width + gx;
    let status = PATH_OK;

    if (sIdx === gIdx) {
      out.status = PATH_OK;
      out.count = 1;
      out.x[0] = goalPX;
      out.y[0] = goalPY;
      return;
    }
    const cs = comp[sIdx] as number;
    if (cs !== comp[gIdx]) {
      const t = partialTarget(cs, gIdx);
      if (t === sIdx) {
        out.status = (compSize[cs] as number) === 1 ? PATH_NONE : PATH_PARTIAL;
        return;
      }
      gIdx = t;
      const ty = Math.trunc(t / width);
      goalPX = tileCenterFx(t - ty * width);
      goalPY = tileCenterFx(ty);
      status = PATH_PARTIAL;
    }
    const before = ts.expanded;
    const rawN = route(sIdx, gIdx);
    stats.expandedNodes += ts.expanded - before;
    if (rawN <= 0) {
      out.status = PATH_NONE;
      return;
    }
    const truncated = smooth(startPX, startPY, rawN, out);
    out.status = truncated ? PATH_TRUNCATED : status;
  };

  return {
    findPath,
    clearCaches() {
      cVer.fill(-1);
      pKeyComp.fill(-1);
      compVersion = -1;
      graph.rebuildAll();
    },
    stats,
    graph,
  };
}
