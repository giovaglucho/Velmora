// Structure-of-arrays world (ADR-005 §3). Fixed capacity, no dynamic growth.
import type { Fx } from '@reinos/shared';

export const MAX_WAYPOINTS = 64;
export const NONE = 0;
export const MAX_GEN = 32767;
export const MAX_SLOTS = 65535;
export const OWNER_NEUTRAL = 255;

export const ORDER_NONE = 0;
export const ORDER_MOVE = 1;

export const PATH_IDLE = 0;
export const PATH_QUEUED = 1;
export const PATH_FOLLOW = 2;
export const PATH_FOLLOW_PARTIAL = 3;
export const PATH_FAILED = 4;

export interface World {
  readonly capacity: number;
  /** 1 + highest slot index ever used; iteration runs up to here. */
  highWater: number;
  /** Live entities. */
  count: number;

  alive: Uint8Array;
  /** Current generation of the slot (>= 1). */
  gen: Uint16Array;
  /** Index into SimData.unitIds. */
  typeId: Uint16Array;
  /** 0..maxPlayers-1; 255 = neutral. */
  owner: Uint8Array;
  radius: Int32Array;

  posX: Int32Array;
  posY: Int32Array;
  /** Position at the start of the tick (Jacobi snapshot + render interpolation). */
  prevX: Int32Array;
  prevY: Int32Array;
  velX: Int32Array;
  velY: Int32Array;
  facing: Uint16Array;

  hp: Int32Array;

  orderKind: Uint8Array;
  goalX: Int32Array;
  goalY: Int32Array;
  pathState: Uint8Array;
  pathCount: Uint8Array;
  pathIdx: Uint8Array;
  /** Length capacity * MAX_WAYPOINTS; slot idx owns [idx*MAX_WAYPOINTS, +pathCount). */
  wpX: Int32Array;
  wpY: Int32Array;
  stuck: Uint16Array;
  repathAt: Int32Array;

  /** LIFO stack of free slot indices (bookkeeping, unhashed). */
  freeSlots: Uint16Array;
  freeTop: number;
}

export interface SpawnInit {
  typeId: number;
  owner: number;
  x: Fx;
  y: Fx;
  radius: Fx;
  hp: Fx;
}

export const eidIndex = (eid: number): number => eid & 0xffff;
export const eidGen = (eid: number): number => eid >>> 16;
export const makeEid = (gen: number, idx: number): number => ((gen << 16) | idx) >>> 0;

export function createWorld(capacity: number): World {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SLOTS)
    throw new RangeError('world capacity must be an integer in [1, ' + MAX_SLOTS + ']');
  const gen = new Uint16Array(capacity);
  gen.fill(1);
  return {
    capacity,
    highWater: 0,
    count: 0,
    alive: new Uint8Array(capacity),
    gen,
    typeId: new Uint16Array(capacity),
    owner: new Uint8Array(capacity),
    radius: new Int32Array(capacity),
    posX: new Int32Array(capacity),
    posY: new Int32Array(capacity),
    prevX: new Int32Array(capacity),
    prevY: new Int32Array(capacity),
    velX: new Int32Array(capacity),
    velY: new Int32Array(capacity),
    facing: new Uint16Array(capacity),
    hp: new Int32Array(capacity),
    orderKind: new Uint8Array(capacity),
    goalX: new Int32Array(capacity),
    goalY: new Int32Array(capacity),
    pathState: new Uint8Array(capacity),
    pathCount: new Uint8Array(capacity),
    pathIdx: new Uint8Array(capacity),
    wpX: new Int32Array(capacity * MAX_WAYPOINTS),
    wpY: new Int32Array(capacity * MAX_WAYPOINTS),
    stuck: new Uint16Array(capacity),
    repathAt: new Int32Array(capacity),
    freeSlots: new Uint16Array(capacity),
    freeTop: 0,
  };
}

export function isAlive(w: World, eid: number): boolean {
  if (eid !== (eid | 0) || eid <= 0) return false;
  const idx = eid & 0xffff;
  return idx < w.capacity && w.alive[idx] === 1 && w.gen[idx] === eid >>> 16;
}

/** Creates an entity; LIFO slot reuse, else a fresh slot. Throws RangeError('entity capacity') when full. */
export function spawn(w: World, init: SpawnInit): number {
  let idx: number;
  if (w.freeTop > 0) {
    w.freeTop--;
    idx = w.freeSlots[w.freeTop] as number;
  } else {
    if (w.highWater >= w.capacity) throw new RangeError('entity capacity');
    idx = w.highWater++;
  }
  w.count++;
  w.alive[idx] = 1;
  w.typeId[idx] = init.typeId;
  w.owner[idx] = init.owner;
  w.radius[idx] = init.radius;
  w.posX[idx] = init.x;
  w.posY[idx] = init.y;
  w.prevX[idx] = init.x;
  w.prevY[idx] = init.y;
  w.hp[idx] = init.hp;
  // every other column is already zero (createWorld / despawn)
  return makeEid(w.gen[idx] as number, idx);
}

/** Removes an entity; false if `eid` is stale or dead. Zeroes the whole slot. */
export function despawn(w: World, eid: number): boolean {
  if (!isAlive(w, eid)) return false;
  const idx = eid & 0xffff;
  w.alive[idx] = 0;
  const g = w.gen[idx] as number;
  w.gen[idx] = g === 32767 ? 1 : g + 1;
  w.typeId[idx] = 0;
  w.owner[idx] = 0;
  w.radius[idx] = 0;
  w.posX[idx] = 0;
  w.posY[idx] = 0;
  w.prevX[idx] = 0;
  w.prevY[idx] = 0;
  w.velX[idx] = 0;
  w.velY[idx] = 0;
  w.facing[idx] = 0;
  w.hp[idx] = 0;
  w.orderKind[idx] = 0;
  w.goalX[idx] = 0;
  w.goalY[idx] = 0;
  w.pathState[idx] = 0;
  w.pathCount[idx] = 0;
  w.pathIdx[idx] = 0;
  w.wpX.fill(0, idx * MAX_WAYPOINTS, idx * MAX_WAYPOINTS + MAX_WAYPOINTS);
  w.wpY.fill(0, idx * MAX_WAYPOINTS, idx * MAX_WAYPOINTS + MAX_WAYPOINTS);
  w.stuck[idx] = 0;
  w.repathAt[idx] = 0;
  w.count--;
  w.freeSlots[w.freeTop++] = idx;
  return true;
}
