import { describe, expect, it } from 'vitest';
import { CameraController } from '../../src/input/cameraController';
import { cam, testGeo, VP } from './helpers';

const CFG = { panSpeedPxPerS: 900, edgeBandPx: 20, edgeDelayMs: 150, zoomTauMs: 80 };

const make = (zoomIndex: 0 | 1 | 2 = 1) => {
  const c = cam(0, 0, zoomIndex);
  const ctl = new CameraController(
    c,
    () => VP,
    () => ({ w: 64, h: 64 }),
    CFG,
    testGeo,
  );
  return { c, ctl };
};

describe('CameraController', () => {
  it('arrow keys move at panSpeedPxPerS screen px/s (world step divided by zoom)', () => {
    const { c, ctl } = make(1);
    ctl.setPanKey(1, 0, true);
    ctl.step(100);
    expect(c.x).toBeCloseTo(90, 6); // 900 px/s × 0.1 s at zoom 1
    ctl.setPanKey(1, 0, false);
    ctl.step(100);
    expect(c.x).toBeCloseTo(90, 6);
  });

  it('screen speed stays constant across zoom levels', () => {
    const z = make(0); // 0.6
    z.ctl.setPanKey(0, 1, true);
    z.ctl.step(1000);
    expect(z.c.y * 0.6).toBeCloseTo(900, 6);
  });

  it('diagonal is normalised', () => {
    const { c, ctl } = make(1);
    ctl.setPanKey(1, 0, true);
    ctl.setPanKey(0, -1, true);
    ctl.step(1000);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(900, 6);
  });

  it('edge scroll only after edgeDelayMs inside the band, and resets when leaving', () => {
    const { c, ctl } = make(1);
    ctl.setPointer({ x: VP.vw - 5, y: 300 });
    ctl.step(100);
    expect(c.x).toBe(0); // 100 < 150
    ctl.step(60);
    expect(c.x).toBeGreaterThan(0);
    const x = c.x;
    ctl.setPointer({ x: 400, y: 300 });
    ctl.step(100);
    expect(c.x).toBe(x);
    ctl.setPointer({ x: 400, y: 5 });
    ctl.step(149);
    expect(c.y).toBe(0); // timer restarted
    ctl.setPointer(null);
    ctl.step(1000);
    expect(c.y).toBe(0);
  });

  it('wheel walks 0.6 → 1 → 1.4 and stops at the extremes; accumulates small deltas', () => {
    const { c, ctl } = make(0);
    ctl.wheel(-100, 640, 360);
    expect(c.zoomIndex).toBe(1);
    ctl.wheel(-100, 640, 360);
    expect(c.zoomIndex).toBe(2);
    ctl.wheel(-100, 640, 360);
    expect(c.zoomIndex).toBe(2);
    ctl.wheel(40, 640, 360);
    expect(c.zoomIndex).toBe(2); // trackpad drip, not yet a step
    ctl.wheel(70, 640, 360);
    expect(c.zoomIndex).toBe(1);
    ctl.wheel(1000, 640, 360);
    expect(c.zoomIndex).toBe(0);
  });

  it('zoom is anchored: the world point under the cursor does not move', () => {
    const { c, ctl } = make(1);
    const before = testGeo.screenToGrid(c, VP, 900, 200);
    ctl.wheel(-100, 900, 200);
    const after = testGeo.screenToGrid(c, VP, 900, 200);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('middle-button drag moves the world with the pointer; centerOnFx converts Fx to tiles', () => {
    const { c, ctl } = make(2);
    ctl.dragPan(14, -28);
    expect(c.x).toBeCloseTo(-10, 6);
    expect(c.y).toBeCloseTo(20, 6);
    ctl.centerOnFx(10_000, 10_000);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(640, 6);
  });
});
