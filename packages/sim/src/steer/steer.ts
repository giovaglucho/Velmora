// Local movement (ADR-005 §10): waypoint following, separation / head-on avoidance over the
// spatial hash, wall sliding, stuck detection and arrival. Pure integer arithmetic.
//
// Jacobi: pass 1 reads only prevX/prevY (and a snapshot of last tick's velocity) of other
// entities, plus order columns that pass 1 never writes; it writes only the processed entity's
// posX/posY/velX/velY/facing/stuck/pathIdx and per-slot decision flags. Order/path state
// transitions (and enqueues) are applied in pass 2, ascending by slot. So the result does not
// depend on the order pass 1 visits entities (tests run it reversed).
import { atan2Idx, dist, fxToTile, isqrt, mulDiv, TILE_FX, type SimData } from '@reinos/shared';
import {
  MAX_WAYPOINTS,
  ORDER_MOVE,
  ORDER_NONE,
  PATH_FAILED,
  PATH_FOLLOW,
  PATH_FOLLOW_PARTIAL,
  PATH_IDLE,
  PATH_QUEUED,
  isAlive,
  makeEid,
  type World,
} from '../ecs/index';
import { createSpatialHash } from '../grid/spatial';
import {
  PATH_NONE,
  PATH_PARTIAL,
  createPathResult,
  createPathfinder,
  lineOfSight,
  type Pathfinder,
} from '../path/index';
import type { Grid, MovementSystem } from '../systems';

export interface MovementOptions {
  /** Test hook: visit entities in descending slot order in pass 1 (must not change results). */
  reverseOrder?: boolean;
  /** Test hook: use this pathfinder instead of creating one. */
  pathfinder?: Pathfinder;
}

export interface MovementSystemImpl extends MovementSystem {
  readonly pathfinder: Pathfinder;
  /** Path requests resolved in the last update() (budget check). */
  readonly lastResolved: number;
}

// decision flags written by pass 1, consumed by pass 2
/** Scale of every `*Permille` tuning value (1000 = 1.0). */
const PERMILLE = 1000;
/** Each unit of a pair covers half of the pair's resolved overlap: divisor = 2 * PERMILLE. */
const PAIR_SHARE_DENOM = 2 * PERMILLE;
/** Bias that turns truncating division by TILE_FX into a ceiling: TILE_FX - 1. */
const TILE_CEIL_BIAS = TILE_FX - 1;

const FLAG_NONE = 0;
const FLAG_DONE = 1; // order finished (arrived)
const FLAG_REPATH = 2; // ask for a new route

export function createMovementSystemWith(
  w: World,
  grid: Grid,
  data: SimData,
  opts?: MovementOptions,
): MovementSystemImpl {
  const mv = data.movement;
  const pf = opts?.pathfinder ?? createPathfinder(grid);
  const reverse = opts?.reverseOrder === true;
  const spatial = createSpatialHash(grid, w.capacity);
  const result = createPathResult();
  let queue = new Int32Array(w.capacity + 1);
  let qHead = 0;
  let qTail = 0;
  let qCount = 0;
  const flags = new Uint8Array(w.capacity);
  const snapVx = new Int32Array(w.capacity);
  const snapVy = new Int32Array(w.capacity);

  let maxRadius = 0;
  for (let k = 0; k < data.radiusFx.length; k++)
    maxRadius = Math.max(maxRadius, data.radiusFx[k] as number);
  const reach = Math.trunc((2 * maxRadius + mv.neighborRangeFx + TILE_CEIL_BIAS) / TILE_FX);
  const sepK = mv.separationPermille;

  const sys: MovementSystemImpl = {
    pathfinder: pf,
    lastResolved: 0,
    enqueue(eid) {
      if (qCount === queue.length) {
        // stop/move cycles can leave stale duplicates: grow (rare) instead of dropping a request
        const bigger = new Int32Array(queue.length * 2);
        for (let k = 0; k < qCount; k++)
          bigger[k] = queue[
            qHead + k < queue.length ? qHead + k : qHead + k - queue.length
          ] as number;
        queue = bigger;
        qHead = 0;
        qTail = qCount;
      }
      queue[qTail] = eid;
      qTail = qTail + 1 === queue.length ? 0 : qTail + 1;
      qCount++;
    },
    clearCaches() {
      pf.clearCaches();
    },
    update(tick) {
      // (a) resolve queued path requests (FIFO, budgeted)
      let budget = mv.pathBudgetPerTick;
      let resolved = 0;
      while (budget > 0 && qCount > 0) {
        const eid = queue[qHead] as number;
        qHead = qHead + 1 === queue.length ? 0 : qHead + 1;
        qCount--;
        if (!isAlive(w, eid)) continue;
        const i = eid & 0xffff;
        if (w.orderKind[i] !== ORDER_MOVE || w.pathState[i] !== PATH_QUEUED) continue;
        budget--;
        resolved++;
        resolvePath(i);
      }
      (sys as { lastResolved: number }).lastResolved = resolved;

      // (b) spatial hash from prevX/prevY
      spatial.rebuild(w);
      snapVx.set(w.velX);
      snapVy.set(w.velY);

      // (c) steering + collisions, pass 1
      const hw = w.highWater;
      if (reverse) {
        for (let i = hw - 1; i >= 0; i--) if (w.alive[i] === 1) steer(i, tick);
      } else {
        for (let i = 0; i < hw; i++) if (w.alive[i] === 1) steer(i, tick);
      }
      // pass 2: state transitions, ascending
      for (let i = 0; i < hw; i++) {
        const f = flags[i] as number;
        if (f === FLAG_NONE) continue;
        flags[i] = FLAG_NONE;
        if (f === FLAG_DONE) {
          w.orderKind[i] = ORDER_NONE;
          w.pathState[i] = PATH_IDLE;
          w.pathCount[i] = 0;
          w.pathIdx[i] = 0;
          w.velX[i] = 0;
          w.velY[i] = 0;
        } else if (f === FLAG_REPATH) {
          w.pathState[i] = PATH_QUEUED;
          w.repathAt[i] = tick + mv.repathCooldownTicks;
          w.stuck[i] = 0;
          w.velX[i] = 0;
          w.velY[i] = 0;
          sys.enqueue(makeEid(w.gen[i] as number, i));
        }
      }
    },
  };

  // a move is legal if it lands on a free tile and does not cut a blocked corner
  function canGo(x: number, y: number, tx0: number, ty0: number): boolean {
    if (x < 0 || y < 0) return false;
    const a = fxToTile(x);
    const b = fxToTile(y);
    if (grid.isBlocked(a, b)) return false;
    return !(a !== tx0 && b !== ty0 && (grid.isBlocked(a, ty0) || grid.isBlocked(tx0, b)));
  }

  function resolvePath(i: number): void {
    pf.findPath(
      {
        startX: w.posX[i] as number,
        startY: w.posY[i] as number,
        goalX: w.goalX[i] as number,
        goalY: w.goalY[i] as number,
      },
      result,
    );
    const base = i * MAX_WAYPOINTS;
    const st = result.status;
    if (st === PATH_NONE) {
      w.orderKind[i] = ORDER_NONE;
      w.pathState[i] = PATH_FAILED;
      w.pathCount[i] = 0;
      w.pathIdx[i] = 0;
      w.velX[i] = 0;
      w.velY[i] = 0;
      return;
    }
    if (st === PATH_PARTIAL && result.count === 0) {
      w.orderKind[i] = ORDER_NONE;
      w.pathState[i] = PATH_IDLE;
      w.pathCount[i] = 0;
      w.pathIdx[i] = 0;
      w.velX[i] = 0;
      w.velY[i] = 0;
      return;
    }
    for (let k = 0; k < result.count; k++) {
      w.wpX[base + k] = result.x[k] as number;
      w.wpY[base + k] = result.y[k] as number;
    }
    w.pathCount[i] = result.count;
    w.pathIdx[i] = 0;
    w.pathState[i] = st === PATH_PARTIAL ? PATH_FOLLOW_PARTIAL : PATH_FOLLOW;
  }

  function steer(i: number, tick: number): void {
    const px = w.prevX[i] as number;
    const py = w.prevY[i] as number;
    const ri = w.radius[i] as number;
    const speed = data.speedFxPerTick[w.typeId[i] as number] as number;
    const state = w.pathState[i] as number;
    const following =
      w.orderKind[i] === ORDER_MOVE && (state === PATH_FOLLOW || state === PATH_FOLLOW_PARTIAL);
    const base = i * MAX_WAYPOINTS;

    // --- effective goal, arrival by distance, waypoint advance ---------------------------------
    let desX = 0;
    let desY = 0;
    let desLen = 0;
    let tgtX = 0;
    let tgtY = 0;
    let effX = 0;
    let effY = 0;
    let wantDone = false;
    let wantRepath = false;
    let idx = w.pathIdx[i] as number;
    const count = w.pathCount[i] as number;
    if (following) {
      if (state === PATH_FOLLOW_PARTIAL && count > 0) {
        effX = w.wpX[base + count - 1] as number;
        effY = w.wpY[base + count - 1] as number;
      } else {
        effX = w.goalX[i] as number;
        effY = w.goalY[i] as number;
      }
      if (dist(effX - px, effY - py) <= mv.arriveDistFx) wantDone = true;
      if (!wantDone) {
        while (idx < count) {
          const wx = w.wpX[base + idx] as number;
          const wy = w.wpY[base + idx] as number;
          const d = dist(wx - px, wy - py);
          if (d <= mv.arriveDistFx) {
            idx++;
            continue;
          }
          if (idx + 1 < count) {
            const nxX = w.wpX[base + idx + 1] as number;
            const nxY = w.wpY[base + idx + 1] as number;
            // close to the waypoint, or already past it (closer to the next one than it is)
            if (
              (d <= ri || dist(nxX - px, nxY - py) <= dist(nxX - wx, nxY - wy)) &&
              lineOfSight(grid, px, py, nxX, nxY, TILE_FX)
            ) {
              idx++;
              continue;
            }
          }
          break;
        }
        w.pathIdx[i] = idx;
        if (idx >= count) {
          if (state === PATH_FOLLOW_PARTIAL) wantDone = true;
          else if (tick >= (w.repathAt[i] as number)) wantRepath = true;
        } else {
          const wx = w.wpX[base + idx] as number;
          const wy = w.wpY[base + idx] as number;
          tgtX = wx;
          tgtY = wy;
          desX = wx - px;
          desY = wy - py;
          desLen = dist(desX, desY);
        }
      }
    }
    // unit direction in permille, used for avoidance
    let ux = 0;
    let uy = 0;
    if (desLen > 0) {
      ux = mulDiv(desX, 1000, desLen);
      uy = mulDiv(desY, 1000, desLen);
    }
    let vx = 0;
    let vy = 0;
    if (desLen > 0 && !wantDone) {
      const step = speed < desLen ? speed : desLen;
      vx = mulDiv(desX, step, desLen);
      vy = mulDiv(desY, step, desLen);
    }

    // --- separation / avoidance (also for idle units, only against real overlap) --------------
    const moving = following && !wantDone && desLen > 0;
    let sx = 0;
    let sy = 0;
    let contacts = 0;
    let blockedByGroup = false;
    const tx0 = fxToTile(px);
    const ty0 = fxToTile(py);
    const groupGoalX = w.goalX[i] as number;
    const groupGoalY = w.goalY[i] as number;
    const myGoalDist = following ? dist(effX - px, effY - py) : 0;
    for (let cy = ty0 - reach; cy <= ty0 + reach; cy++) {
      for (let cx = tx0 - reach; cx <= tx0 + reach; cx++) {
        spatial.query(cx, cy);
        for (let k = spatial.start; k < spatial.end; k++) {
          const j = spatial.slots[k] as number;
          if (j === i) continue;
          const dx = px - (w.prevX[j] as number);
          const dy = py - (w.prevY[j] as number);
          const minSep = ri + (w.radius[j] as number);
          const range = moving ? minSep + mv.neighborRangeFx : minSep;
          const adx = dx < 0 ? -dx : dx;
          const ady = dy < 0 ? -dy : dy;
          if (adx >= range || ady >= range) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= range * range) continue;
          const d = isqrt(d2);
          // each unit of a pair covers half the overlap fraction (sepK / 1000) per tick: the pair
          // resolves `sepK` permille of the overlap, which keeps dense crowds from oscillating
          const m = mulDiv(range - d, sepK, PAIR_SHARE_DENOM);
          if (d > 0) {
            sx += mulDiv(dx, m, d);
            sy += mulDiv(dy, m, d);
          } else if (i < j) sx -= m;
          else sx += m;
          if (d < minSep + mv.neighborRangeFx) contacts++;
          if (moving) {
            // head-on: the neighbour is ahead and walks against us -> sidestep to our left-hand side
            const ahead = -(dx * ux + dy * uy); // > 0 when the neighbour lies in our heading
            if (ahead > 0 && (snapVx[j] as number) * ux + (snapVy[j] as number) * uy < 0) {
              sx += mulDiv(-uy, m, 1000);
              sy += mulDiv(ux, m, 1000);
            }
          }
          if (
            following &&
            w.orderKind[j] === ORDER_NONE &&
            w.goalX[j] === groupGoalX &&
            w.goalY[j] === groupGoalY &&
            d < minSep + mv.neighborRangeFx &&
            dist(effX - (w.prevX[j] as number), effY - (w.prevY[j] as number)) < myGoalDist
          )
            blockedByGroup = true;
        }
      }
    }

    // --- group arrival (stuck behind units that already arrived) -------------------------------
    const stuck = w.stuck[i] as number;
    if (following && !wantDone && stuck >= mv.stuckTicks) {
      // patience: the accepted distance grows the longer the unit makes no progress, so a unit
      // that cannot get closer (crowd around the goal) always ends its order eventually
      const tolerance =
        mv.groupArriveDistFx + mulDiv(mv.groupArriveDistFx, stuck - mv.stuckTicks, mv.stuckTicks);
      if (myGoalDist <= tolerance || blockedByGroup) wantDone = true;
      else if (contacts === 0 && tick >= (w.repathAt[i] as number)) wantRepath = true;
    }
    if (wantDone) {
      flags[i] = FLAG_DONE;
      vx = 0;
      vy = 0;
      // an arrived unit still gets pushed out of real overlaps below
    } else if (wantRepath) {
      flags[i] = FLAG_REPATH;
      vx = 0;
      vy = 0;
    }

    vx += sx;
    vy += sy;
    const vl2 = vx * vx + vy * vy;
    if (vl2 > speed * speed) {
      const vl = isqrt(vl2);
      vx = mulDiv(vx, speed, vl);
      vy = mulDiv(vy, speed, vl);
    }

    // --- terrain collision: axis-separated sliding, then clearance from orthogonal walls ------
    let nx = px + vx;
    let ny = py + vy;
    if (vx !== 0 || vy !== 0) {
      if (!canGo(nx, ny, tx0, ty0)) {
        if (canGo(nx, py, tx0, ty0)) ny = py;
        else if (canGo(px, ny, tx0, ty0)) nx = px;
        else {
          nx = px;
          ny = py;
        }
      }
      const tx = fxToTile(nx);
      const ty = fxToTile(ny);
      const left = tx * 1000 + ri;
      const right = tx * 1000 + 1000 - ri;
      const top = ty * 1000 + ri;
      const bottom = ty * 1000 + 1000 - ri;
      if (nx < left && grid.isBlocked(tx - 1, ty)) nx = left;
      if (nx > right && grid.isBlocked(tx + 1, ty)) nx = right;
      if (ny < top && grid.isBlocked(tx, ty - 1)) ny = top;
      if (ny > bottom && grid.isBlocked(tx, ty + 1)) ny = bottom;
    }
    w.posX[i] = nx;
    w.posY[i] = ny;
    const mx = nx - px;
    const my = ny - py;
    if (flags[i] === FLAG_NONE) {
      w.velX[i] = mx;
      w.velY[i] = my;
    }
    if (mx !== 0 || my !== 0) w.facing[i] = atan2Idx(my, mx);

    // --- stuck counter: no progress towards the current waypoint (while following a route) -----
    if (following && flags[i] === FLAG_NONE) {
      const progress = desLen > 0 ? desLen - dist(tgtX - nx, tgtY - ny) : 0;
      if (progress * PERMILLE < speed * mv.minProgressPermille) {
        if (stuck < 65535) w.stuck[i] = stuck + 1;
      } else if (stuck > 0) w.stuck[i] = stuck - 1; // leaky: jittering without net progress still accumulates
    }
  }

  return sys;
}
