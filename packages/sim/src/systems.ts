// Decoupling point between the loop/commands (task B) and grid/path/steer (task C), ADR-005 §8.
// `Grid` is declared here structurally so B does not depend on grid/ (owned by C, wave 2); the
// real grid/index.ts exports a compatible `Grid`. Until C5 lands, createSim defaults to the
// straight-line stub below.
import { atan2Idx, dist, mulDiv, type MapSpec, type SimData } from '@reinos/shared';
import {
  MAX_WAYPOINTS,
  ORDER_MOVE,
  ORDER_NONE,
  PATH_FOLLOW,
  PATH_IDLE,
  PATH_QUEUED,
  isAlive,
  type World,
} from './ecs/index';

export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly sectorsX: number;
  readonly sectorsY: number;
  /** 0 free, 1 blocked. */
  readonly terrain: Uint8Array;
  /** Number of building footprints covering the tile (0 = free). */
  readonly occ: Uint8Array;
  /** +1 on every change that alters walkability. */
  version: number;
  isBlocked(tx: number, ty: number): boolean;
  setTerrain(tx: number, ty: number, blocked: boolean): void;
  occupyRect(tx: number, ty: number, w: number, h: number): void;
  releaseRect(tx: number, ty: number, w: number, h: number): void;
  sectorOf(tx: number, ty: number): number;
  nearestFree(tx: number, ty: number, out: { tx: number; ty: number }): boolean;
  flush(): void;
}

/** Builds the grid for a match and decodes the map into it (injected by createSim). */
export type GridFactory = (map: MapSpec) => Grid;

export interface MovementSystem {
  /** Called by the command system; FIFO queue. */
  enqueue(eid: number): void;
  /** For the cache-transparency test. */
  clearCaches(): void;
  /** Steps 4(a..c) of the tick. */
  update(tick: number): void;
}
export type MovementFactory = (w: World, grid: Grid, data: SimData) => MovementSystem;

/**
 * Straight-line movement with no collision or pathfinding: the T0 stub. It honours the same
 * contract (FIFO queue validated on dequeue, per-tick budget, order lifecycle) so the loop and
 * commands are testable without wave 2.
 */
export const createStubMovement: MovementFactory = (w, _grid, data) => {
  const queue: number[] = [];
  let head = 0;
  const mv = data.movement;

  return {
    enqueue(eid) {
      queue.push(eid);
    },
    clearCaches() {},
    update() {
      // (a) resolve queued path requests: the "path" is the goal itself
      let budget = mv.pathBudgetPerTick;
      while (budget > 0 && head < queue.length) {
        const eid = queue[head++] as number;
        if (!isAlive(w, eid)) continue;
        const i = eid & 0xffff;
        if (w.orderKind[i] !== ORDER_MOVE || w.pathState[i] !== PATH_QUEUED) continue;
        budget--;
        w.pathState[i] = PATH_FOLLOW;
        w.pathCount[i] = 1;
        w.pathIdx[i] = 0;
        w.wpX[i * MAX_WAYPOINTS] = w.goalX[i] as number;
        w.wpY[i * MAX_WAYPOINTS] = w.goalY[i] as number;
      }
      if (head === queue.length) {
        queue.length = 0;
        head = 0;
      }
      // (c) steer straight to the goal, reading only prevX/prevY (Jacobi)
      for (let i = 0; i < w.highWater; i++) {
        if (w.alive[i] === 0 || w.orderKind[i] !== ORDER_MOVE || w.pathState[i] !== PATH_FOLLOW)
          continue;
        const dx = (w.goalX[i] as number) - (w.prevX[i] as number);
        const dy = (w.goalY[i] as number) - (w.prevY[i] as number);
        const d = dist(dx, dy);
        if (d <= mv.arriveDistFx) {
          w.orderKind[i] = ORDER_NONE;
          w.pathState[i] = PATH_IDLE;
          w.pathCount[i] = 0;
          w.velX[i] = 0;
          w.velY[i] = 0;
          continue;
        }
        const speed = data.speedFxPerTick[w.typeId[i] as number] as number;
        const step = speed < d ? speed : d;
        const vx = mulDiv(dx, step, d);
        const vy = mulDiv(dy, step, d);
        w.velX[i] = vx;
        w.velY[i] = vy;
        w.posX[i] = (w.prevX[i] as number) + vx;
        w.posY[i] = (w.prevY[i] as number) + vy;
        w.facing[i] = atan2Idx(dy, dx);
      }
    },
  };
};
