import { describe, expect, it, vi } from 'vitest';
import { SelectionModel } from '../../src/input/selection';
import { makeView } from './helpers';

describe('SelectionModel', () => {
  it('click replaces, empty click clears, shift toggles', () => {
    const s = new SelectionModel(200);
    s.click(5, false);
    expect(s.eids).toEqual([5]);
    s.click(3, true);
    expect(s.eids).toEqual([3, 5]);
    s.click(3, true);
    expect(s.eids).toEqual([5]);
    s.click(null, true); // shift+empty keeps
    expect(s.eids).toEqual([5]);
    s.click(null, false);
    expect(s.eids).toEqual([]);
  });

  it('box replaces or (shift) unions; always ascending and unique', () => {
    const s = new SelectionModel(200);
    s.box([8, 2, 2], false);
    expect(s.eids).toEqual([2, 8]);
    s.box([5, 2], true);
    expect(s.eids).toEqual([2, 5, 8]);
    s.box([], false);
    expect(s.eids).toEqual([]);
  });

  it('notifies only on real change', () => {
    const s = new SelectionModel(200);
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.set([1, 2]);
    s.set([2, 1]); // same set
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    s.clear();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('prune drops dead units', () => {
    const s = new SelectionModel(200);
    const v = makeView([
      { x: 1, y: 1 },
      { x: 2, y: 2, alive: false },
      { x: 3, y: 3 },
    ]);
    s.set([v.eid(0), v.eid(1), v.eid(2)]);
    s.prune(v);
    expect(s.eids).toEqual([v.eid(0), v.eid(2)]);
  });
});
