import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import { HALF_H, HALF_W, MAX_INTERP_JUMP_FX, ZOOMS } from '../../src/render/constants';
import {
  ellipseForRadius,
  fxToGrid,
  gridToFx,
  gridToWorld,
  interpolatedPos,
  interpolationAlpha,
  screenToGrid,
  screenToWorld,
  worldToGrid,
  worldToScreen,
} from '../../src/render/iso';
import { createCamera } from '../../src/render/camera';
import { createFakeFeed } from '../../src/render/harness/fakeFeed';

const vp = { vw: 1280, vh: 720 };

describe('iso projection (ADR-006 §4.1)', () => {
  it('maps the map corners and tile centre as specified', () => {
    expect(gridToWorld(0, 0)).toEqual({ x: 0, y: 0 });
    const W = 128;
    const H = 96;
    expect(gridToWorld(W, 0)).toEqual({ x: W * HALF_W, y: W * HALF_H });
    expect(gridToWorld(0, H)).toEqual({ x: -H * HALF_W, y: H * HALF_H });
    expect(gridToWorld(W, H)).toEqual({ x: (W - H) * HALF_W, y: (W + H) * HALF_H });
    expect(gridToWorld(3.5, 5.5)).toEqual({ x: -2 * 64, y: 9 * 32 });
  });
  it('is exactly 2:1 (an edge advances 2 px in x per 1 px in y)', () => {
    const a = gridToWorld(10, 10);
    const b = gridToWorld(11, 10); // +x grid = down-right
    expect(b.x - a.x).toBe(2 * (b.y - a.y));
    const c = gridToWorld(10, 11); // +y grid = down-left
    expect(c.x - a.x).toBe(-2 * (c.y - a.y));
    expect(gridToWorld(1, 0)).toEqual({ x: 64, y: 32 });
    expect(gridToWorld(0, 1)).toEqual({ x: -64, y: 32 });
  });
  it('elevation raises by ELEV_PX per level', () => {
    expect(gridToWorld(2, 2, 3).y).toBe(gridToWorld(2, 2).y - 48);
  });
  it('round trip grid → world → grid over 10^4 random points', () => {
    const rng = createPrng(7);
    for (let i = 0; i < 10_000; i++) {
      const gx = rng.nextInt(512_000) / 1000 - 10;
      const gy = rng.nextInt(512_000) / 1000 - 10;
      const w = gridToWorld(gx, gy);
      const g = worldToGrid(w.x, w.y);
      expect(g.x).toBeCloseTo(gx, 9);
      expect(g.y).toBeCloseTo(gy, 9);
    }
  });
  it('round trip grid → screen → grid with camera/zoom over 10^4 cases', () => {
    const rng = createPrng(11);
    for (let i = 0; i < 10_000; i++) {
      const cam = createCamera();
      cam.x = rng.nextInt(20_000) - 10_000;
      cam.y = rng.nextInt(10_000);
      cam.zoomT = ZOOMS[rng.nextInt(3)] as number;
      const sx = rng.nextInt(1280);
      const sy = rng.nextInt(720);
      const g = screenToGrid(cam, vp, sx, sy);
      const w = gridToWorld(g.x, g.y);
      const s = worldToScreen(cam, vp, w.x, w.y);
      expect(s.x).toBeCloseTo(sx, 6);
      expect(s.y).toBeCloseTo(sy, 6);
      const sw = screenToWorld(cam, vp, sx, sy);
      expect(sw.x).toBeCloseTo(w.x, 6);
    }
  });
  it('the viewport centre shows the camera centre', () => {
    const cam = createCamera();
    cam.x = 123;
    cam.y = 456;
    expect(worldToScreen(cam, vp, 123, 456)).toEqual({ x: 640, y: 360 });
  });
  it('Fx conversions: single rounding, exact on whole tiles', () => {
    expect(fxToGrid(2500)).toBe(2.5);
    expect(gridToFx(2.5)).toBe(2500);
    expect(gridToFx(0.0004)).toBe(0);
    expect(gridToFx(0.0005)).toBe(1);
    expect(gridToFx(fxToGrid(123_456))).toBe(123_456);
  });
  it('ellipseForRadius: circle of radius r → rx = r·64·√2, ry = rx/2', () => {
    const e = ellipseForRadius(500);
    expect(e.rx).toBeCloseTo(0.5 * 64 * Math.SQRT2, 9);
    expect(e.ry).toBeCloseTo(e.rx / 2, 9);
    // the projected circle really has those semi-axes
    let maxX = 0;
    let maxY = 0;
    for (let k = 0; k < 360; k++) {
      const a = (k * Math.PI) / 180;
      const w = gridToWorld(0.5 * Math.cos(a), 0.5 * Math.sin(a));
      maxX = Math.max(maxX, Math.abs(w.x));
      maxY = Math.max(maxY, Math.abs(w.y));
    }
    expect(maxX).toBeCloseTo(e.rx, 1);
    expect(maxY).toBeCloseTo(e.ry, 1);
  });
});

describe('interpolation (ADR-006 §3.7)', () => {
  const feed = createFakeFeed({ units: 2, mapW: 64, mapH: 64, seed: 3 });
  const v = feed.view;
  it('lerps prev → pos', () => {
    v.prevX[0] = 10_000;
    v.prevY[0] = 20_000;
    v.posX[0] = 10_040;
    v.posY[0] = 19_960;
    expect(interpolatedPos(v, 0, 0)).toEqual({ x: 10_000, y: 20_000 });
    expect(interpolatedPos(v, 0, 1)).toEqual({ x: 10_040, y: 19_960 });
    expect(interpolatedPos(v, 0, 0.5)).toEqual({ x: 10_020, y: 19_980 });
  });
  it('does not interpolate jumps above MAX_INTERP_JUMP_FX on either axis', () => {
    v.prevX[1] = 0;
    v.prevY[1] = 0;
    v.posX[1] = MAX_INTERP_JUMP_FX + 1;
    v.posY[1] = 0;
    expect(interpolatedPos(v, 1, 0.5)).toEqual({ x: MAX_INTERP_JUMP_FX + 1, y: 0 });
    v.posX[1] = MAX_INTERP_JUMP_FX; // boundary: still interpolated
    expect(interpolatedPos(v, 1, 0.5).x).toBe(MAX_INTERP_JUMP_FX / 2);
    v.posX[1] = 0;
    v.posY[1] = -(MAX_INTERP_JUMP_FX + 1);
    expect(interpolatedPos(v, 1, 0.25).y).toBe(-(MAX_INTERP_JUMP_FX + 1));
  });
  it('alpha is clamped to [0,1] and saturates when the next tick is late', () => {
    expect(interpolationAlpha(1000, 1000, 50_000)).toBe(0);
    expect(interpolationAlpha(1025, 1000, 50_000)).toBeCloseTo(0.5, 9);
    expect(interpolationAlpha(1050, 1000, 50_000)).toBe(1);
    expect(interpolationAlpha(5000, 1000, 50_000)).toBe(1);
    expect(interpolationAlpha(900, 1000, 50_000)).toBe(0);
    expect(interpolationAlpha(1000, 1000, 0)).toBe(1);
  });
});
