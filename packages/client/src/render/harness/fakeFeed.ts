// Deterministic fake SnapshotView source for render tests and the e2e harness (ADR-006 §3.2 layout, by slot).
// The real one is the worker's SimClient (carril W); this stands in so R2/R3 can be verified alone.
import { createPrng } from '@reinos/shared';
import { FLAG_ALIVE, FLAG_MOVING, type SnapshotView } from '../../worker/snapshot';

export interface FakeFeedOptions {
  units: number;
  mapW: number;
  mapH: number;
  seed: number;
  /** Capacity of the columns (≥ units). Default: next multiple of 256 above units, at least 512. */
  capacity?: number;
  /** Centre (tiles) of the initial block. Default: map centre. */
  centerX?: number;
  centerY?: number;
  /** Units per side of the initial square block and spacing in tiles. */
  spacing?: number;
  tickIntervalUs?: number;
  /** Number of owners the units are split between (round robin). */
  owners?: number;
  /** Types the units are split between (round robin). */
  types?: number;
}

export interface FakeFeed {
  readonly view: MutableView;
  /** SnapshotFeed: latest snapshot (always the same object, mutated in place like a real SAB view). */
  latest(): SnapshotView | null;
  latestArrivalMs: number;
  /** Advances the fake sim by one tick: prev := pos, pos += vel, bouncing inside the map. */
  step(nowMs: number): void;
}

export interface MutableView extends SnapshotView {
  tick: number;
  turn: number;
  highWater: number;
  count: number;
}

const FX = 1000;

export function createFakeFeed(o: FakeFeedOptions): FakeFeed {
  const cap = o.capacity ?? Math.max(512, Math.ceil((o.units + 1) / 256) * 256);
  const owners = o.owners ?? 2;
  const types = o.types ?? 5;
  const rng = createPrng(o.seed >>> 0);
  const posX = new Int32Array(cap);
  const posY = new Int32Array(cap);
  const prevX = new Int32Array(cap);
  const prevY = new Int32Array(cap);
  const hp = new Int32Array(cap);
  const gen = new Uint16Array(cap);
  const typeId = new Uint16Array(cap);
  const facing = new Uint16Array(cap);
  const owner = new Uint8Array(cap).fill(255);
  const flags = new Uint8Array(cap);
  const velX = new Int32Array(cap);
  const velY = new Int32Array(cap);
  const side = Math.ceil(Math.sqrt(o.units));
  const spacing = o.spacing ?? 1.6;
  const cx = o.centerX ?? o.mapW / 2;
  const cy = o.centerY ?? o.mapH / 2;
  const SPEED_FX = 40; // 0.8 tiles/s at 20 Hz

  const retarget = (i: number): void => {
    const a = rng.nextInt(1024);
    const ang = (a * 2 * Math.PI) / 1024;
    velX[i] = Math.round(Math.cos(ang) * SPEED_FX);
    velY[i] = Math.round(Math.sin(ang) * SPEED_FX);
    facing[i] = a;
  };

  for (let i = 0; i < o.units; i++) {
    const gx = cx + ((i % side) - side / 2) * spacing + (rng.nextInt(400) - 200) / 1000;
    const gy = cy + (Math.floor(i / side) - side / 2) * spacing + (rng.nextInt(400) - 200) / 1000;
    posX[i] = prevX[i] = Math.round(gx * FX);
    posY[i] = prevY[i] = Math.round(gy * FX);
    hp[i] = 25 * FX;
    gen[i] = 1;
    typeId[i] = i % types;
    owner[i] = i % owners;
    flags[i] = FLAG_ALIVE | FLAG_MOVING;
    retarget(i);
  }

  const view: MutableView = {
    tick: 0,
    turn: 0,
    highWater: o.units,
    count: o.units,
    tickIntervalUs: o.tickIntervalUs ?? 50_000,
    mapW: o.mapW,
    mapH: o.mapH,
    posX,
    posY,
    prevX,
    prevY,
    hp,
    gen,
    typeId,
    facing,
    owner,
    flags,
    eid: (slot) => ((gen[slot] ?? 0) << 16) | slot,
  };

  const maxX = o.mapW * FX - 1;
  const maxY = o.mapH * FX - 1;
  const feed: FakeFeed = {
    view,
    latestArrivalMs: 0,
    latest: () => view,
    step(nowMs) {
      for (let i = 0; i < view.highWater; i++) {
        if (((flags[i] ?? 0) & FLAG_ALIVE) === 0) continue;
        prevX[i] = posX[i] ?? 0;
        prevY[i] = posY[i] ?? 0;
        let nx = (posX[i] ?? 0) + (velX[i] ?? 0);
        let ny = (posY[i] ?? 0) + (velY[i] ?? 0);
        if (nx < 0 || nx > maxX || ny < 0 || ny > maxY) {
          nx = Math.min(Math.max(nx, 0), maxX);
          ny = Math.min(Math.max(ny, 0), maxY);
          retarget(i);
        } else if ((view.tick + i) % 80 === 0) retarget(i);
        posX[i] = nx;
        posY[i] = ny;
      }
      view.tick++;
      feed.latestArrivalMs = nowMs;
    },
  };
  return feed;
}
