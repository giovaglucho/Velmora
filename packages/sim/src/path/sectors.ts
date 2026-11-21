// Sector graph for the hierarchical search (ADR-005 §10).
//
// Sectors are 16x16. Each border shared by two orthogonally adjacent sectors is cut into maximal
// runs of tile pairs that are free on both sides; every run becomes a *portal*: two graph nodes,
// A (tile on the owner's side) and B (the tile across the border), joined by a cross edge of
// cost 10. A portal is owned by the sector west/north of its border (E border first, then S
// border). Nodes carry intra-sector edges (costs from a sector-bounded Dijkstra) to every other
// node that lies in the same sector.
//
// Node id = ((sector * 16 + k) << 1) | side; E portals use slots 0..7, S portals 8..15. The layout is fixed, so rebuilding a subset of
// sectors yields exactly the graph a from-scratch build would (checked by hash in tests).
import { fnv1aInt32, FNV_OFFSET_BASIS } from '@reinos/shared';
import type { Grid } from '../systems';
import { SECTOR_SHIFT, SECTOR_SIZE, type GridImpl } from '../grid/grid';
import { COST_ORTHO, INF, boxDijkstra } from './astar';
import { createHeap } from './heap';

export const PORTALS_PER_SECTOR = 16; // up to 8 on the E border + 8 on the S border
export const NODES_PER_SECTOR = 32;
export const MAX_EDGES = 32; // 1 cross edge + up to 31 intra-sector edges

export interface SectorGraph {
  readonly grid: Grid;
  readonly sectorCount: number;
  /** nodeCap = sectorCount * 32; ids >= nodeCap are free for callers (virtual nodes). */
  readonly nodeCap: number;
  /** Tile index of the node, -1 if the slot is unused. */
  readonly nodeTile: Int32Array;
  /** Sector in which the node lies (valid only for used slots). */
  readonly nodeSector: Int32Array;
  readonly edgeCount: Uint8Array;
  readonly edgeTo: Int32Array; // node * MAX_EDGES + e
  readonly edgeCost: Int32Array;
  /** Owned portals of a sector (E count + S count). */
  readonly portalCount: Uint8Array;
  /** How many of the owned portals are on the E border. */
  readonly portalEast: Uint8Array;
  /** Writes the nodes lying in sector s (canonical order) into out; returns how many. */
  nodesIn(s: number, out: Int32Array): number;
  /** Rebuilds the listed sectors plus their 4 neighbours (list ascending). */
  rebuildSectors(list: Int32Array, count: number): void;
  rebuildAll(): void;
  /** Brings the graph up to date with the grid (flushes pending dirty sectors). */
  sync(): void;
  /** Stable hash of nodes and edges (tests: incremental == from scratch). */
  hash(): number;
}

export function createSectorGraph(grid: Grid): SectorGraph {
  const { width, height, sectorsX, sectorsY } = grid;
  const sectorCount = sectorsX * sectorsY;
  const nodeCap = sectorCount * NODES_PER_SECTOR;
  const nodeTile = new Int32Array(nodeCap).fill(-1);
  const nodeSector = new Int32Array(nodeCap);
  const edgeCount = new Uint8Array(nodeCap);
  const edgeTo = new Int32Array(nodeCap * MAX_EDGES);
  const edgeCost = new Int32Array(nodeCap * MAX_EDGES);
  const portalCount = new Uint8Array(sectorCount);
  const portalEast = new Uint8Array(sectorCount);
  const heap = createHeap(1024);
  const cost = new Int32Array(256);
  const mark = new Uint8Array(sectorCount);
  const impl = grid as Partial<GridImpl>;
  const tracked = impl.dirty !== undefined && impl.addFlushListener !== undefined;
  let builtVersion = grid.version;

  const blocked = (x: number, y: number): boolean => grid.isBlocked(x, y);

  const rebuildPortals = (s: number): void => {
    const sy = Math.trunc(s / sectorsX);
    const sx = s - sy * sectorsX;
    const x0 = sx << SECTOR_SHIFT;
    const y0 = sy << SECTOR_SHIFT;
    const x1 = Math.min(x0 + SECTOR_SIZE, width);
    const y1 = Math.min(y0 + SECTOR_SIZE, height);
    const base = s * NODES_PER_SECTOR;
    for (let k = 0; k < NODES_PER_SECTOR; k++) nodeTile[base + k] = -1;
    // fixed slot ranges (E: 0..7, S: 8..15) keep ids stable when only one border changes
    let k = 0;
    let east = 0;
    if (sx + 1 < sectorsX) {
      let y = y0;
      while (y < y1) {
        if (blocked(x1 - 1, y) || blocked(x1, y)) {
          y++;
          continue;
        }
        const ys = y;
        while (y < y1 && !blocked(x1 - 1, y) && !blocked(x1, y)) y++;
        const yc = ys + ((y - ys - 1) >> 1);
        const a = (s * PORTALS_PER_SECTOR + k) << 1;
        nodeTile[a] = yc * width + (x1 - 1);
        nodeTile[a + 1] = yc * width + x1;
        nodeSector[a] = s;
        nodeSector[a + 1] = s + 1;
        k++;
        east++;
      }
    }
    k = 8;
    let south = 0;
    if (sy + 1 < sectorsY) {
      let x = x0;
      while (x < x1) {
        if (blocked(x, y1 - 1) || blocked(x, y1)) {
          x++;
          continue;
        }
        const xs = x;
        while (x < x1 && !blocked(x, y1 - 1) && !blocked(x, y1)) x++;
        const xc = xs + ((x - xs - 1) >> 1);
        const a = (s * PORTALS_PER_SECTOR + k) << 1;
        nodeTile[a] = (y1 - 1) * width + xc;
        nodeTile[a + 1] = y1 * width + xc;
        nodeSector[a] = s;
        nodeSector[a + 1] = s + sectorsX;
        k++;
        south++;
      }
    }
    portalCount[s] = east + south;
    portalEast[s] = east;
  };

  const nodesIn = (s: number, out: Int32Array): number => {
    const sy = Math.trunc(s / sectorsX);
    const sx = s - sy * sectorsX;
    let n = 0;
    const east = portalEast[s] as number;
    const south = (portalCount[s] as number) - east;
    for (let k = 0; k < east; k++) out[n++] = (s * PORTALS_PER_SECTOR + k) << 1;
    for (let k = 8; k < 8 + south; k++) out[n++] = (s * PORTALS_PER_SECTOR + k) << 1;
    if (sx > 0) {
      const w = s - 1;
      const e = portalEast[w] as number;
      for (let k = 0; k < e; k++) out[n++] = ((w * PORTALS_PER_SECTOR + k) << 1) | 1;
    }
    if (sy > 0) {
      const nn = s - sectorsX;
      const south = (portalCount[nn] as number) - (portalEast[nn] as number);
      for (let k = 8; k < 8 + south; k++) out[n++] = ((nn * PORTALS_PER_SECTOR + k) << 1) | 1;
    }
    return n;
  };

  const nodes = new Int32Array(NODES_PER_SECTOR);
  const rebuildEdges = (s: number): void => {
    const sy = Math.trunc(s / sectorsX);
    const sx = s - sy * sectorsX;
    const x0 = sx << SECTOR_SHIFT;
    const y0 = sy << SECTOR_SHIFT;
    const x1 = Math.min(x0 + SECTOR_SIZE, width);
    const y1 = Math.min(y0 + SECTOR_SIZE, height);
    const n = nodesIn(s, nodes);
    for (let a = 0; a < n; a++) {
      const na = nodes[a] as number;
      const t = nodeTile[na] as number;
      boxDijkstra(grid, heap, t, x0, y0, x1, y1, cost);
      let e = na * MAX_EDGES;
      edgeTo[e] = na ^ 1;
      edgeCost[e] = COST_ORTHO;
      e++;
      for (let b = 0; b < n; b++) {
        if (b === a) continue;
        const nb = nodes[b] as number;
        const tb = nodeTile[nb] as number;
        const by = Math.trunc(tb / width);
        const bx = tb - by * width;
        const c = cost[((by - y0) << 4) + (bx - x0)] as number;
        if (c >= INF) continue;
        edgeTo[e] = nb;
        edgeCost[e] = c;
        e++;
      }
      edgeCount[na] = e - na * MAX_EDGES;
    }
  };

  const rebuildSectors = (list: Int32Array, count: number): void => {
    mark.fill(0);
    for (let i = 0; i < count; i++) {
      const s = list[i] as number;
      const sy = Math.trunc(s / sectorsX);
      const sx = s - sy * sectorsX;
      mark[s] = 1;
      if (sx > 0) mark[s - 1] = 1;
      if (sx + 1 < sectorsX) mark[s + 1] = 1;
      if (sy > 0) mark[s - sectorsX] = 1;
      if (sy + 1 < sectorsY) mark[s + sectorsX] = 1;
    }
    // phase 1: portals of every affected sector; phase 2: edges (they read neighbours' portals)
    for (let s = 0; s < sectorCount; s++) if (mark[s] === 1) rebuildPortals(s);
    for (let s = 0; s < sectorCount; s++) {
      if (mark[s] === 1) {
        // clear edge counts of unused slots so stale edges never survive
        const base = s * NODES_PER_SECTOR;
        for (let k = 0; k < NODES_PER_SECTOR; k++)
          if ((nodeTile[base + k] as number) < 0) edgeCount[base + k] = 0;
        rebuildEdges(s);
      }
    }
  };

  const all = new Int32Array(sectorCount);
  for (let s = 0; s < sectorCount; s++) all[s] = s;

  const graph: SectorGraph = {
    grid,
    sectorCount,
    nodeCap,
    nodeTile,
    nodeSector,
    edgeCount,
    edgeTo,
    edgeCost,
    portalCount,
    portalEast,
    nodesIn,
    rebuildSectors,
    rebuildAll() {
      rebuildSectors(all, sectorCount);
      builtVersion = grid.version;
    },
    sync() {
      if (tracked) {
        if (impl.hasPendingFlush?.() === true) (grid as GridImpl).flush();
      } else if (builtVersion !== grid.version) graph.rebuildAll();
    },
    hash() {
      let h = FNV_OFFSET_BASIS;
      for (let s = 0; s < sectorCount; s++) {
        h = fnv1aInt32(h, portalCount[s] as number);
        h = fnv1aInt32(h, portalEast[s] as number);
        const base = s * NODES_PER_SECTOR;
        for (let k = 0; k < NODES_PER_SECTOR; k++) {
          const nd = base + k;
          const t = nodeTile[nd] as number;
          h = fnv1aInt32(h, t);
          if (t < 0) continue;
          h = fnv1aInt32(h, nodeSector[nd] as number);
          const ec = edgeCount[nd] as number;
          h = fnv1aInt32(h, ec);
          for (let e = 0; e < ec; e++) {
            h = fnv1aInt32(h, edgeTo[nd * MAX_EDGES + e] as number);
            h = fnv1aInt32(h, edgeCost[nd * MAX_EDGES + e] as number);
          }
        }
      }
      return h >>> 0;
    },
  };

  graph.rebuildAll();
  if (tracked) {
    (grid as GridImpl).addFlushListener((list, count) => {
      graph.rebuildSectors(list, count);
      builtVersion = grid.version;
    });
  }
  return graph;
}
