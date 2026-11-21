import { describe, expect, it } from 'vitest';
import {
  isAliveEid,
  pickBox,
  pickPoint,
  pickSameTypeOnScreen,
  rectIsClick,
  type PickContext,
} from '../../src/input/picking';
import { SelectionModel } from '../../src/input/selection';
import { cam, footOf, makeView, testGeo, VP, type FakeUnit } from './helpers';

function ctxOf(units: FakeUnit[], extra: Partial<PickContext> = {}): PickContext {
  return {
    view: makeView(units),
    cam: cam(),
    vp: VP,
    geo: testGeo,
    alpha: 1,
    localPlayer: 0,
    ...extra,
  };
}

describe('pickPoint', () => {
  it('picks the unit under the cursor (body ellipse above the foot)', () => {
    const c = ctxOf([{ x: 10, y: 10 }]);
    const f = footOf(c.view, 0);
    expect(pickPoint(c, f.x, f.y - 30)).toBe(c.view.eid(0));
    expect(pickPoint(c, f.x + 200, f.y)).toBeNull();
  });

  it('front-most (larger x+y) wins when sprites overlap', () => {
    const c = ctxOf([
      { x: 10, y: 10 },
      { x: 10.2, y: 10.2 }, // slightly in front, overlapping on screen
    ]);
    const f = footOf(c.view, 1);
    expect(pickPoint(c, f.x, f.y - 20)).toBe(c.view.eid(1));
  });

  it('ties on depth bucket resolve by higher slot (stable)', () => {
    const c = ctxOf([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ]);
    const f = footOf(c.view, 0);
    expect(pickPoint(c, f.x, f.y - 20)).toBe(c.view.eid(1));
  });

  it('ignores dead slots', () => {
    const c = ctxOf([{ x: 10, y: 10, alive: false }]);
    const f = footOf(c.view, 0);
    expect(pickPoint(c, f.x, f.y - 20)).toBeNull();
  });

  it('does not pick enemies in fog but picks visible enemies and own units', () => {
    const units = [
      { x: 10, y: 10, owner: 1 },
      { x: 20, y: 10, owner: 0 },
    ];
    const hidden = ctxOf(units, { isTileVisible: () => false });
    const f0 = footOf(hidden.view, 0);
    const f1 = footOf(hidden.view, 1);
    expect(pickPoint(hidden, f0.x, f0.y - 20)).toBeNull();
    expect(pickPoint(hidden, f1.x, f1.y - 20)).toBe(hidden.view.eid(1));
    const seen = ctxOf(units, { isTileVisible: () => true });
    expect(pickPoint(seen, f0.x, f0.y - 20)).toBe(seen.view.eid(0));
    const ally = ctxOf(units, { isTileVisible: () => false, isAlly: (o) => o === 1 });
    expect(pickPoint(ally, f0.x, f0.y - 20)).toBe(ally.view.eid(0));
  });

  it('uses the interpolated position (alpha) like the renderer', () => {
    const view = makeView([{ x: 10, y: 10 }]);
    const moved = { ...view, posX: Int32Array.from([12000]), prevX: Int32Array.from([10000]) };
    const mid = { view: moved, cam: cam(), vp: VP, geo: testGeo, alpha: 0.5, localPlayer: 0 };
    const w = testGeo.gridToWorld(11, 10);
    const s = testGeo.worldToScreen(mid.cam, VP, w.x, w.y);
    expect(pickPoint(mid, s.x, s.y - 20)).toBe(view.eid(0));
  });
});

describe('pickBox', () => {
  const units: FakeUnit[] = [
    { x: 10, y: 10, owner: 0 },
    { x: 11, y: 10, owner: 0 },
    { x: 10, y: 11, owner: 1 }, // enemy inside the box: never box-selected
    { x: 30, y: 30, owner: 0 }, // outside
    { x: 10.5, y: 10.5, owner: 0, alive: false },
  ];

  it('selects only own live units whose foot is inside, eids ascending', () => {
    const c = ctxOf(units);
    const a = footOf(c.view, 0);
    const b = footOf(c.view, 1);
    const rect = { x0: a.x - 40, y0: a.y - 60, x1: b.x + 40, y1: b.y + 60 };
    expect(pickBox(c, rect)).toEqual([c.view.eid(0), c.view.eid(1)]);
    // reversed corners give the same result
    expect(pickBox(c, { x0: rect.x1, y0: rect.y1, x1: rect.x0, y1: rect.y0 })).toEqual([
      c.view.eid(0),
      c.view.eid(1),
    ]);
  });

  it('a rect under 4 px is a click (single unit, any owner)', () => {
    const c = ctxOf(units);
    const e = footOf(c.view, 2);
    const r = { x0: e.x, y0: e.y - 20, x1: e.x + 3, y1: e.y - 18 };
    expect(rectIsClick(r)).toBe(true);
    expect(pickBox(c, r)).toEqual([c.view.eid(2)]);
    expect(rectIsClick({ x0: 0, y0: 0, x1: 4, y1: 0 })).toBe(false);
  });
});

describe('pickSameTypeOnScreen', () => {
  it('own units of the type that are on screen, ascending', () => {
    const c = ctxOf([
      { x: 10, y: 10, typeId: 2 },
      { x: 11, y: 10, typeId: 3 },
      { x: 12, y: 10, typeId: 2 },
      { x: 300, y: 300, typeId: 2 }, // far off screen
      { x: 11, y: 11, typeId: 2, owner: 1 },
    ]);
    expect(pickSameTypeOnScreen(c, 2)).toEqual([c.view.eid(0), c.view.eid(2)]);
  });
});

describe('isAliveEid', () => {
  it('rejects a reused slot with another generation', () => {
    const v = makeView([{ x: 1, y: 1, gen: 2 }]);
    expect(isAliveEid(v, v.eid(0))).toBe(true);
    expect(isAliveEid(v, (1 << 16) | 0)).toBe(false);
    expect(isAliveEid(v, 5)).toBe(false);
  });
});

describe('selection cap from data (maxUnits)', () => {
  it('caps a box result to maxUnits, deterministic lowest eids', () => {
    const sel = new SelectionModel(3);
    sel.box([9, 3, 7, 1, 5], false);
    expect(sel.eids).toEqual([1, 3, 5]);
    sel.box([2, 4], true); // shift-add past the cap
    expect(sel.eids).toEqual([1, 2, 3]);
    expect(() => new SelectionModel(0)).toThrow();
  });
});
