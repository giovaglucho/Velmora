// Test doubles for the input lane: an injected InputGeometry implementing the ADR-006 §4.1 projection
// (independent of the render lane) and a fake SnapshotView builder.
import type { InputGeometry } from '../../src/input/geometry';
import type { Camera, Viewport, ZoomIndex } from '../../src/render/types';
import type { SnapshotView } from '../../src/worker/snapshot';

const HALF_W = 64;
const HALF_H = 32;
const ZOOMS = [0.6, 1, 1.4] as const;

export const VP: Viewport = { vw: 1280, vh: 720 };
export const cam = (x = 0, y = 1000, zoomIndex: ZoomIndex = 1): Camera => ({
  x,
  y,
  zoomIndex,
  zoomT: ZOOMS[zoomIndex],
});

export const testGeo: InputGeometry = {
  gridToWorld: (gx, gy, h = 0) => ({ x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H - h * 16 }),
  worldToScreen: (c, vp, wx, wy) => ({
    x: (wx - c.x) * c.zoomT + vp.vw / 2,
    y: (wy - c.y) * c.zoomT + vp.vh / 2,
  }),
  screenToGrid: (c, vp, sx, sy) => {
    const wx = (sx - vp.vw / 2) / c.zoomT + c.x;
    const wy = (sy - vp.vh / 2) / c.zoomT + c.y;
    return { x: (wx / HALF_W + wy / HALF_H) / 2, y: (wy / HALF_H - wx / HALF_W) / 2 };
  },
  gridToFx: (g) => Math.round(g * 1000),
  ellipseForRadius: (r) => ({ rx: (r / 1000) * 64 * Math.SQRT2, ry: (r / 1000) * 32 * Math.SQRT2 }),
  interpolatedPos: (v, s, a) => ({
    x: (v.prevX[s] ?? 0) + ((v.posX[s] ?? 0) - (v.prevX[s] ?? 0)) * a,
    y: (v.prevY[s] ?? 0) + ((v.posY[s] ?? 0) - (v.prevY[s] ?? 0)) * a,
  }),
  depthKey: (x, y, slot) => ((x + y) >> 7) * 4096 + (slot & 4095),
  spriteVisible: (sx, sy, zoom, vp) =>
    sx + 32 * zoom + 16 >= 0 &&
    sx - 32 * zoom - 16 <= vp.vw &&
    sy + 16 >= 0 &&
    sy - 96 * zoom - 16 <= vp.vh,
  centerOnGrid: (c, gx, gy) => {
    c.x = (gx - gy) * HALF_W;
    c.y = (gx + gy) * HALF_H;
  },
  setZoomAnchored: (c, vp, zi, ax, ay) => {
    const wx = (ax - vp.vw / 2) / c.zoomT + c.x;
    const wy = (ay - vp.vh / 2) / c.zoomT + c.y;
    c.zoomIndex = zi;
    c.zoomT = ZOOMS[zi]; // instant in the double; the real one eases (stepZoom)
    c.x = wx - (ax - vp.vw / 2) / c.zoomT;
    c.y = wy - (ay - vp.vh / 2) / c.zoomT;
  },
  stepZoom: () => undefined,
  clampCamera: (c) => {
    c.x = Math.max(-100000, Math.min(100000, c.x));
    c.y = Math.max(-100000, Math.min(100000, c.y));
  },
};

export interface FakeUnit {
  /** tile coordinates (float) */
  x: number;
  y: number;
  owner?: number;
  typeId?: number;
  alive?: boolean;
  gen?: number;
}

export function makeView(units: FakeUnit[], mapW = 64, mapH = 64): SnapshotView {
  const n = units.length;
  const posX = new Int32Array(n);
  const posY = new Int32Array(n);
  const gen = new Uint16Array(n);
  const typeId = new Uint16Array(n);
  const owner = new Uint8Array(n);
  const flags = new Uint8Array(n);
  units.forEach((u, i) => {
    posX[i] = Math.round(u.x * 1000);
    posY[i] = Math.round(u.y * 1000);
    gen[i] = u.gen ?? 1;
    typeId[i] = u.typeId ?? 0;
    owner[i] = u.owner ?? 0;
    flags[i] = u.alive === false ? 0 : 1;
  });
  return {
    tick: 1,
    turn: 0,
    highWater: n,
    count: units.filter((u) => u.alive !== false).length,
    tickIntervalUs: 50000,
    mapW,
    mapH,
    posX,
    posY,
    prevX: posX,
    prevY: posY,
    hp: new Int32Array(n),
    gen,
    typeId,
    facing: new Uint16Array(n),
    owner,
    flags,
    eid: (slot) => (((gen[slot] ?? 0) << 16) | slot) >>> 0,
  };
}

/** Screen position of a unit's foot in the double. */
export function footOf(view: SnapshotView, slot: number, c: Camera = cam()) {
  const w = testGeo.gridToWorld((view.posX[slot] ?? 0) / 1000, (view.posY[slot] ?? 0) / 1000);
  return testGeo.worldToScreen(c, VP, w.x, w.y);
}
