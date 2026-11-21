// Contract check against the REAL pure render modules (ADR-006 §4): the input layer must work with the
// production projection, not only with the injected test double.
import { describe, expect, it } from 'vitest';
import { renderGeometry, interpolationAlpha } from '../../src/input/geometry';
import { pickBox, pickPoint, footScreen, type PickContext } from '../../src/input/picking';
import { buildMoveCommands, OrderIssuer } from '../../src/input/orders';
import { createCamera } from '../../src/render/camera';
import { makeView, VP } from './helpers';

function ctx(): PickContext {
  const camera = createCamera();
  renderGeometry.centerOnGrid(camera, 12, 12);
  const view = makeView([
    { x: 12, y: 12 },
    { x: 13, y: 12 },
    { x: 12, y: 13, owner: 1 },
  ]);
  return { view, cam: camera, vp: VP, geo: renderGeometry, alpha: 1, localPlayer: 0 };
}

describe('input with the real render geometry', () => {
  it('picks the unit and box-selects own units', () => {
    const c = ctx();
    const f = footScreen(c, 0);
    expect(pickPoint(c, f.sx, f.sy - 20)).toBe(c.view.eid(0));
    const f1 = footScreen(c, 1);
    const rect = { x0: f.sx - 60, y0: f.sy - 80, x1: f1.sx + 60, y1: f1.sy + 40 };
    expect(pickBox(c, rect)).toEqual([c.view.eid(0), c.view.eid(1)]);
  });

  it('right click on a unit foot unprojects to that unit position (within 1 Fx)', () => {
    const c = ctx();
    const sent: unknown[] = [];
    const issuer = new OrderIssuer({
      sink: { send: (cmds) => sent.push(...cmds) },
      geo: renderGeometry,
      localPlayer: () => 0,
      getView: () => c.view,
      getCamera: () => c.cam,
      getViewport: () => c.vp,
      getSelection: () => [c.view.eid(0)],
    });
    const f = footScreen(c, 1);
    const [cmd] = issuer.moveToScreen(f.sx, f.sy);
    expect(Math.abs((cmd?.target?.x ?? 0) - 13000)).toBeLessThanOrEqual(1);
    expect(Math.abs((cmd?.target?.y ?? 0) - 12000)).toBeLessThanOrEqual(1);
    expect(buildMoveCommands([1], 0, { x: 0, y: 0 }, { w: 8, h: 8 })).toHaveLength(1);
  });

  it('interpolationAlpha clamps to [0,1]', () => {
    expect(interpolationAlpha(100, 100, 50000)).toBe(0);
    expect(interpolationAlpha(125, 100, 50000)).toBe(0.5);
    expect(interpolationAlpha(1000, 100, 50000)).toBe(1);
    expect(interpolationAlpha(0, 100, 50000)).toBe(0);
  });
});
