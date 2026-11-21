import { describe, expect, it } from 'vitest';
import { CONTROL_GROUP_COUNT, DOUBLE_PRESS_MS } from '../../src/input/constants';
import { ControlGroups, centroidFx } from '../../src/input/controlGroups';
import { makeView } from './helpers';

describe('ControlGroups', () => {
  it('saves a sorted copy and recalls only live members (dead ones are filtered, stored list kept)', () => {
    const g = new ControlGroups();
    const v1 = makeView([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    g.save(3, [v1.eid(2), v1.eid(0), v1.eid(1)]);
    expect(g.recall(3, v1, 0).eids).toEqual([v1.eid(0), v1.eid(1), v1.eid(2)]);
    const v2 = makeView([
      { x: 1, y: 1 },
      { x: 2, y: 2, alive: false },
      { x: 3, y: 3 },
    ]);
    expect(g.members(3, v2)).toEqual([v2.eid(0), v2.eid(2)]);
    expect(g.sizes(v2)[3]).toEqual({ size: 2 });
    expect(g.sizes(null)[3]).toEqual({ size: 3 });
    expect(g.sizes(null)).toHaveLength(CONTROL_GROUP_COUNT);
  });

  it('empty selection clears; invalid group throws', () => {
    const g = new ControlGroups();
    g.save(1, [1]);
    g.save(1, []);
    expect(g.sizes(null)[1]).toEqual({ size: 0 });
    expect(() => g.save(10, [1])).toThrow(RangeError);
    expect(() => g.save(-1, [1])).toThrow(RangeError);
  });

  it('double press within the window asks to centre on the integer centroid', () => {
    const g = new ControlGroups();
    const v = makeView([
      { x: 10, y: 10 },
      { x: 20, y: 30 },
    ]);
    g.save(2, [v.eid(0), v.eid(1)]);
    const a = g.recall(2, v, 1000);
    expect(a.center).toBe(false);
    const b = g.recall(2, v, 1000 + DOUBLE_PRESS_MS - 1);
    expect(b.center).toBe(true);
    expect(b.centroidFx).toEqual({ x: 15000, y: 20000 });
    // a third quick press starts a new pair
    expect(g.recall(2, v, 1000 + DOUBLE_PRESS_MS + 10).center).toBe(false);
  });

  it('slow second press, other digit, or empty group never centre', () => {
    const g = new ControlGroups();
    const v = makeView([{ x: 1, y: 1 }]);
    g.save(1, [v.eid(0)]);
    g.recall(1, v, 0);
    expect(g.recall(1, v, DOUBLE_PRESS_MS).center).toBe(false);
    g.recall(1, v, 10_000);
    expect(g.recall(0, v, 10_001).center).toBe(false);
    expect(g.recall(5, v, 10_002).center).toBe(false);
    expect(g.recall(5, v, 10_003).center).toBe(false); // empty group
  });

  it('centroidFx ignores dead units', () => {
    const v = makeView([
      { x: 2, y: 2 },
      { x: 100, y: 100, alive: false },
    ]);
    expect(centroidFx(v, [v.eid(0), v.eid(1)])).toEqual({ x: 2000, y: 2000 });
    expect(centroidFx(v, [v.eid(1)])).toBeNull();
  });
});
