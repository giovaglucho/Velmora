import { describe, expect, it } from 'vitest';
import {
  centerOnFx,
  centerOnGrid,
  clampCamera,
  createCamera,
  setZoomAnchored,
  stepZoom,
  viewRectWorld,
} from '../../src/render/camera';
import { ZOOMS } from '../../src/render/constants';
import { gridToWorld, screenToWorld, worldToGrid } from '../../src/render/iso';

const vp = { vw: 1280, vh: 720 };

describe('camera (ADR-006 §4.2)', () => {
  it('starts at zoom 1', () => {
    const c = createCamera();
    expect(c.zoomIndex).toBe(1);
    expect(c.zoomT).toBe(1);
  });
  it('viewRectWorld shrinks with zoom and is centred on the camera', () => {
    const c = createCamera();
    c.x = 100;
    c.y = 50;
    expect(viewRectWorld(c, vp)).toEqual({
      x0: 100 - 640,
      y0: 50 - 360,
      x1: 100 + 640,
      y1: 50 + 360,
    });
    c.zoomT = 2;
    const r = viewRectWorld(c, vp);
    expect(r.x1 - r.x0).toBe(640);
    expect(r.y1 - r.y0).toBe(360);
  });
  it('centerOnFx / centerOnGrid place the viewport centre on the tile', () => {
    const c = createCamera();
    centerOnFx(c, 10_500, 20_500);
    expect(c.x).toBe(gridToWorld(10.5, 20.5).x);
    expect(c.y).toBe(gridToWorld(10.5, 20.5).y);
    centerOnGrid(c, 0, 0);
    expect(c).toMatchObject({ x: 0, y: 0 });
  });
  it('zoom goes through the 3 levels and settles exactly on them', () => {
    const c = createCamera();
    for (const zi of [0, 2, 1] as const) {
      setZoomAnchored(c, vp, zi, 640, 360);
      for (let i = 0; i < 200; i++) stepZoom(c, 16.7, 80);
      expect(c.zoomT).toBe(ZOOMS[zi]);
      expect(c.anchor).toBeNull();
    }
  });
  it('zoom is exponential with τ: after τ ms covers 1 − 1/e of the gap', () => {
    const c = createCamera(); // zoom 1 → 1.4
    setZoomAnchored(c, vp, 2, 640, 360);
    stepZoom(c, 80, 80);
    expect(c.zoomT).toBeCloseTo(1 + 0.4 * (1 - Math.exp(-1)), 9);
  });
  it('the world point under the cursor does not move during an anchored zoom (every step)', () => {
    const c = createCamera();
    c.x = 5000;
    c.y = 2500;
    const sx = 1000;
    const sy = 200;
    const before = screenToWorld(c, vp, sx, sy);
    setZoomAnchored(c, vp, 0, sx, sy);
    for (let i = 0; i < 60; i++) {
      stepZoom(c, 16.7, 80);
      const w = screenToWorld(c, vp, sx, sy);
      expect(w.x).toBeCloseTo(before.x, 6);
      expect(w.y).toBeCloseTo(before.y, 6);
    }
    expect(c.zoomT).toBe(0.6);
  });
  it('re-anchoring mid-flight keeps the point under the new cursor fixed', () => {
    const c = createCamera();
    setZoomAnchored(c, vp, 2, 300, 300);
    stepZoom(c, 30, 80);
    const mid = screenToWorld(c, vp, 900, 500);
    setZoomAnchored(c, vp, 0, 900, 500);
    for (let i = 0; i < 80; i++) stepZoom(c, 16.7, 80);
    const w = screenToWorld(c, vp, 900, 500);
    expect(w.x).toBeCloseTo(mid.x, 6);
    expect(w.y).toBeCloseTo(mid.y, 6);
  });
  it('clampCamera keeps the centre inside the map expanded by the margin (grid rectangle)', () => {
    const c = createCamera();
    c.x = 1e6;
    c.y = 1e6;
    clampCamera(c, 128, 128, 4);
    const g = worldToGrid(c.x, c.y);
    expect(g.x).toBeCloseTo(132, 6);
    expect(g.y).toBeCloseTo(132, 6);
    c.x = -1e6;
    c.y = 0;
    clampCamera(c, 128, 96);
    const h = worldToGrid(c.x, c.y);
    expect(h.x).toBeGreaterThanOrEqual(-4 - 1e-9);
    expect(h.y).toBeLessThanOrEqual(100 + 1e-9);
    // inside → untouched
    const d = createCamera();
    centerOnGrid(d, 60, 70);
    const { x, y } = d;
    clampCamera(d, 128, 128);
    expect(d).toMatchObject({ x, y });
  });
});
