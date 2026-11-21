import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as storeModule from '../../src/ui/store';
import { getGameView } from '../../src/ui/store';
import {
  startBridge,
  PUBLISH_PERIOD_MS,
  type BridgeScheduler,
  type BridgeSources,
} from '../../src/ui/bridge';
import { SelectionModel } from '../../src/input/selection';
import { ControlGroups } from '../../src/input/controlGroups';
import { cam, makeView } from '../input/helpers';

const UI = join(import.meta.dirname, '..', '..', 'src', 'ui');
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe('ui/store read-only facade', () => {
  it('exports only useGameView and getGameView (no setter/publish)', () => {
    expect(Object.keys(storeModule).sort()).toEqual(['getGameView', 'useGameView']);
  });

  it('only store.ts and bridge.ts import storeCore (the writer)', () => {
    const offenders = walk(UI)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\/(store|bridge|storeCore)\.ts$/.test(f))
      .filter((f) => /storeCore/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('components never call setState/publish on the store', () => {
    const offenders = walk(join(UI, 'hud'))
      .concat(join(UI, 'App.tsx'))
      .filter((f) => /\bsetState\b|\bpublish\b/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

function fakeScheduler() {
  let fn: (() => void) | null = null;
  let period = 0;
  const s: BridgeScheduler = {
    setInterval: (f, ms) => ((fn = f), (period = ms), 1),
    clearInterval: () => (fn = null),
  };
  return {
    s,
    tick: () => fn?.(),
    get period() {
      return period;
    },
    get active() {
      return fn !== null;
    },
  };
}

describe('bridge: 10 Hz publication', () => {
  const view = makeView([
    { x: 1, y: 1, typeId: 0 },
    { x: 2, y: 2, typeId: 1 },
    { x: 3, y: 3, typeId: 1 },
  ]);
  const mk = () => {
    const selection = new SelectionModel(200);
    const sched = fakeScheduler();
    let fps = 60;
    const src: BridgeSources = {
      getView: () => view,
      selection,
      groups: new ControlGroups(),
      getCamera: () => cam(),
      getStats: () => ({ fps, frameMs: 16.66, drawCalls: 12 }),
      getTickMs: () => 1.234,
      typeKey: (id) => (id === 0 ? 'villager' : 'spearman'),
      mode: () => 'sab',
      localPlayer: () => 0,
      intents: { selectGroup: () => undefined },
      scheduler: sched.s,
    };
    return { selection, sched, src, setFps: (v: number) => (fps = v) };
  };

  it('schedules at 100 ms and publishes the composed view on each tick', () => {
    const { sched, src, setFps } = mk();
    const b = startBridge(src);
    expect(sched.period).toBe(PUBLISH_PERIOD_MS);
    expect(PUBLISH_PERIOD_MS).toBe(100);
    expect(getGameView().perf).toMatchObject({ fps: 60, drawCalls: 12, mode: 'sab', tickMs: 1.23 });
    setFps(30);
    expect(getGameView().perf.fps).toBe(60); // frames never reach the store between ticks
    sched.tick();
    expect(getGameView().perf.fps).toBe(30);
    b.dispose();
    expect(sched.active).toBe(false);
  });

  it('selection changes publish immediately, grouped by type, with first60 and count', () => {
    const { selection, src } = mk();
    const b = startBridge(src);
    selection.set([view.eid(0), view.eid(1), view.eid(2)]);
    expect(getGameView().selection).toEqual({
      count: 3,
      byType: { villager: 1, spearman: 2 },
      first60: [view.eid(0), view.eid(1), view.eid(2)],
    });
    b.dispose();
    selection.clear(); // after dispose nothing is published
    expect(getGameView().selection.count).toBe(3);
  });

  it('first60 is capped at 60 while count keeps the real total', () => {
    const big = makeView(
      Array.from({ length: 150 }, (_, i) => ({ x: i % 50, y: Math.floor(i / 50) })),
    );
    const { selection, src } = mk();
    const b = startBridge({ ...src, getView: () => big });
    selection.set(Array.from({ length: 150 }, (_, i) => big.eid(i)));
    expect(getGameView().selection.count).toBe(150);
    expect(getGameView().selection.first60).toHaveLength(60);
    b.dispose();
  });

  it('reports 10 control groups and the zoom index', () => {
    const { src } = mk();
    const b = startBridge(src);
    expect(getGameView().controlGroups).toHaveLength(10);
    expect(getGameView().camera.zoomIndex).toBe(1);
    b.dispose();
  });
});
