import { describe, expect, it, vi } from 'vitest';
import { MAX_CMD_UNITS, validateCommandShape } from '@reinos/shared';
import type { Command } from '@reinos/shared';
import {
  OrderIssuer,
  buildMoveCommands,
  buildStopCommands,
  clampTargetFx,
} from '../../src/input/orders';
import { cam, makeView, testGeo, VP } from './helpers';

const MAP = { w: 64, h: 64 };

describe('buildMoveCommands', () => {
  it('produces a shared-format move: turn 0, ascending unique unitIds, pos target', () => {
    const [c, ...rest] = buildMoveCommands([9, 3, 3, 5], 1, { x: 12345, y: 6789 }, MAP);
    expect(rest).toEqual([]);
    expect(c).toEqual({
      turn: 0,
      playerId: 1,
      type: 'move',
      unitIds: [3, 5, 9],
      target: { kind: 'pos', x: 12345, y: 6789 },
      payload: null,
    });
    expect(validateCommandShape(c)).toBe(true);
  });

  it('clamps the target to [0, W*1000-1]', () => {
    const [c] = buildMoveCommands([1], 0, { x: -50, y: 999_999 }, MAP);
    expect(c?.target).toEqual({ kind: 'pos', x: 0, y: 63_999 });
    expect(clampTargetFx(70_000, 64)).toBe(63_999);
    expect(clampTargetFx(600_000, 1000)).toBe(512_000); // shared MAX_COORD_FX
  });

  it('splits selections over MAX_CMD_UNITS into valid chunks covering every unit once', () => {
    const ids = Array.from({ length: MAX_CMD_UNITS * 2 + 7 }, (_, i) => i);
    const cmds = buildMoveCommands(ids, 0, { x: 1000, y: 1000 }, MAP);
    expect(cmds.map((c) => c.unitIds.length)).toEqual([MAX_CMD_UNITS, MAX_CMD_UNITS, 7]);
    expect(cmds.every(validateCommandShape)).toBe(true);
    expect(cmds.flatMap((c) => c.unitIds)).toEqual(ids);
  });

  it('nothing to send for an empty selection', () => {
    expect(buildMoveCommands([], 0, { x: 0, y: 0 }, MAP)).toEqual([]);
  });
});

describe('buildStopCommands', () => {
  it('stop has a null target and is valid', () => {
    const [c] = buildStopCommands([4, 2], 0);
    expect(c).toMatchObject({ type: 'stop', unitIds: [2, 4], target: null, turn: 0 });
    expect(validateCommandShape(c)).toBe(true);
  });
});

describe('OrderIssuer', () => {
  const view = makeView([
    { x: 10, y: 10, owner: 0 },
    { x: 11, y: 10, owner: 0 },
    { x: 12, y: 10, owner: 1 }, // enemy
    { x: 13, y: 10, owner: 0, alive: false },
  ]);
  const make = (sel: number[]) => {
    const sent: Command[][] = [];
    const calls: string[] = [];
    const issuer = new OrderIssuer({
      sink: { send: (c) => (calls.push('send'), sent.push(c)) },
      marker: { showOrderMarker: () => calls.push('marker') },
      geo: testGeo,
      localPlayer: () => 0,
      getView: () => view,
      getCamera: () => cam(),
      getViewport: () => VP,
      getSelection: () => sel,
    });
    return { issuer, sent, calls };
  };

  it('right click: marker first, then a move to the unprojected target', () => {
    const { issuer, sent, calls } = make([view.eid(0), view.eid(1)]);
    const w = testGeo.gridToWorld(20, 20);
    const s = testGeo.worldToScreen(cam(), VP, w.x, w.y);
    const out = issuer.moveToScreen(s.x, s.y);
    expect(calls).toEqual(['marker', 'send']);
    expect(sent[0]).toBe(out);
    expect(out[0]?.target).toEqual({ kind: 'pos', x: 20000, y: 20000 });
    expect(out[0]?.unitIds).toEqual([view.eid(0), view.eid(1)]);
  });

  it('only own live units obey; an enemy-only or dead selection sends nothing', () => {
    expect(make([view.eid(2)]).issuer.moveToGrid(5, 5)).toEqual([]);
    expect(make([view.eid(3)]).issuer.moveToGrid(5, 5)).toEqual([]);
    const m = make([view.eid(0), view.eid(2), view.eid(3)]);
    expect(m.issuer.moveToGrid(5, 5)[0]?.unitIds).toEqual([view.eid(0)]);
  });

  it('no snapshot yet: no-op', () => {
    const send = vi.fn();
    const issuer = new OrderIssuer({
      sink: { send },
      geo: testGeo,
      localPlayer: () => 0,
      getView: () => null,
      getCamera: () => cam(),
      getViewport: () => VP,
      getSelection: () => [1],
    });
    expect(issuer.moveToGrid(1, 1)).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('stop sends stop for own units', () => {
    const { issuer, sent } = make([view.eid(0), view.eid(1)]);
    issuer.stop();
    expect(sent[0]?.[0]).toMatchObject({ type: 'stop' });
  });
});
