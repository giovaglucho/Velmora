import { describe, expect, it } from 'vitest';
import type { Command } from '@reinos/shared';
import { createInputController, type InputController } from '../../src/input/controller';
import { DOUBLE_CLICK_MS } from '../../src/input/constants';
import type { PointerLike } from '../../src/input/pointerRouter';
import type { ScreenRect } from '../../src/input/picking';
import { cam, footOf, makeView, testGeo, VP, type FakeUnit } from './helpers';

const CFG = {
  maxUnits: 200,
  camera: { panSpeedPxPerS: 900, edgeBandPx: 20, edgeDelayMs: 150, zoomTauMs: 80 },
};
const ev = (button: number, m: Partial<PointerLike> = {}): PointerLike => ({
  button,
  clientX: 0,
  clientY: 0,
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  preventDefault: () => undefined,
  ...m,
});

function setup(units: FakeUnit[]) {
  const view = makeView(units);
  const sent: Command[][] = [];
  const markers: Array<[number, number]> = [];
  const boxes: Array<ScreenRect | null> = [];
  let now = 0;
  const camera = cam();
  const ic: InputController = createInputController({
    config: CFG,
    geo: testGeo,
    camera,
    getViewport: () => VP,
    getView: () => view,
    getAlpha: () => 1,
    localPlayer: () => 0,
    now: () => now,
    send: (c) => sent.push(c),
    marker: { showOrderMarker: (x, y) => markers.push([x, y]) },
    onBox: (r) => boxes.push(r),
  });
  return { ic, view, sent, markers, boxes, camera, setNow: (n: number) => (now = n) };
}

const click = (ic: InputController, x: number, y: number, m: Partial<PointerLike> = {}) => {
  ic.router.pointerDown(ev(0, m), x, y);
  ic.router.pointerUp(ev(0, m), x, y);
};

describe('PointerRouter', () => {
  const units: FakeUnit[] = [
    { x: 10, y: 10, typeId: 1 },
    { x: 11, y: 10, typeId: 1 },
    { x: 12, y: 10, typeId: 2 },
    { x: 11, y: 12, owner: 1 },
  ];

  it('click selects, click on ground clears, shift click toggles', () => {
    const t = setup(units);
    const f0 = footOf(t.view, 0);
    const f1 = footOf(t.view, 1);
    click(t.ic, f0.x, f0.y - 20);
    expect(t.ic.selection.eids).toEqual([t.view.eid(0)]);
    click(t.ic, f1.x, f1.y - 20, { shiftKey: true });
    expect(t.ic.selection.eids).toEqual([t.view.eid(0), t.view.eid(1)]);
    click(t.ic, 5, 5);
    expect(t.ic.selection.count).toBe(0);
  });

  it('drag draws a box (overlay callback) and selects own units; hides it on release', () => {
    const t = setup(units);
    const a = footOf(t.view, 0);
    const b = footOf(t.view, 2);
    t.ic.router.pointerDown(ev(0), a.x - 50, a.y - 80);
    t.ic.router.pointerMove(b.x + 50, b.y + 40);
    expect(t.ic.router.state).toBe('boxSelecting');
    expect(t.boxes.at(-1)).not.toBeNull();
    t.ic.router.pointerUp(ev(0), b.x + 50, b.y + 40);
    expect(t.boxes.at(-1)).toBeNull();
    expect(t.ic.router.state).toBe('idle');
    expect(t.ic.selection.eids).toEqual([0, 1, 2].map((s) => t.view.eid(s)));
  });

  it('double click (and Ctrl+click) selects every same-type own unit on screen', () => {
    const t = setup(units);
    const f = footOf(t.view, 0);
    click(t.ic, f.x, f.y - 20);
    t.setNow(DOUBLE_CLICK_MS - 1);
    click(t.ic, f.x, f.y - 20);
    expect(t.ic.selection.eids).toEqual([t.view.eid(0), t.view.eid(1)]);
    t.ic.selection.clear();
    const g = footOf(t.view, 2);
    click(t.ic, g.x, g.y - 20, { ctrlKey: true });
    expect(t.ic.selection.eids).toEqual([t.view.eid(2)]);
    // slow second click is just a click
    t.ic.selection.clear();
    t.setNow(5000);
    click(t.ic, f.x, f.y - 20);
    t.setNow(5000 + DOUBLE_CLICK_MS + 1);
    click(t.ic, f.x, f.y - 20);
    expect(t.ic.selection.eids).toEqual([t.view.eid(0)]);
  });

  it('right click: marker and move command at pointerdown, contextmenu suppressed', () => {
    const t = setup(units);
    t.ic.selection.set([t.view.eid(0), t.view.eid(1)]);
    const w = testGeo.gridToWorld(30, 20);
    const s = testGeo.worldToScreen(t.camera, VP, w.x, w.y);
    let prevented = false;
    t.ic.router.pointerDown(ev(2, { preventDefault: () => (prevented = true) }), s.x, s.y);
    expect(prevented).toBe(true);
    expect(t.markers).toEqual([[30000, 20000]]);
    expect(t.sent[0]?.[0]).toMatchObject({
      type: 'move',
      turn: 0,
      target: { kind: 'pos', x: 30000, y: 20000 },
    });
  });

  it('middle button pans, wheel zooms', () => {
    const t = setup(units);
    t.ic.router.pointerDown(ev(1), 100, 100);
    expect(t.ic.router.state).toBe('panning');
    t.ic.router.pointerMove(110, 100);
    t.ic.router.pointerUp(ev(1), 110, 100);
    expect(t.camera.x).toBeCloseTo(-10, 6);
    expect(t.ic.router.state).toBe('idle');
    t.ic.router.wheel({ ...ev(0), deltaY: -100 }, 640, 360);
    expect(t.camera.zoomIndex).toBe(2);
  });

  it('keyboard: Ctrl+1 saves, 1 recalls, double press centres, S stops, arrows pan', () => {
    const t = setup(units);
    const key = (code: string, m: Partial<{ ctrlKey: boolean }> = {}) => ({
      code,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: () => undefined,
      ...m,
    });
    t.ic.selection.set([t.view.eid(0), t.view.eid(1)]);
    t.ic.router.keyDown(key('Digit1', { ctrlKey: true }));
    t.ic.selection.clear();
    t.ic.router.keyDown(key('Digit1'));
    expect(t.ic.selection.eids).toEqual([t.view.eid(0), t.view.eid(1)]);
    t.setNow(100);
    t.ic.router.keyDown(key('Digit1'));
    expect(t.camera.x).toBeCloseTo((10.5 - 10) * 64, 6);
    t.ic.router.keyDown(key('KeyS'));
    expect(t.sent.at(-1)?.[0]).toMatchObject({ type: 'stop' });
    t.camera.x = 0;
    t.ic.router.keyDown(key('ArrowRight'));
    t.ic.step(100);
    expect(t.camera.x).toBeCloseTo(90, 6);
    t.ic.router.keyUp(key('ArrowRight'));
    t.ic.step(100);
    expect(t.camera.x).toBeCloseTo(90, 6);
  });

  it('keys typed into an input element are ignored', () => {
    const t = setup(units);
    t.ic.selection.set([t.view.eid(0)]);
    t.ic.router.keyDown({
      code: 'KeyS',
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: () => undefined,
      target: { tagName: 'INPUT' },
    });
    expect(t.sent).toEqual([]);
  });

  it('attach() wires DOM events (EventTarget fake) and the returned function detaches', () => {
    const t = setup(units);
    const canvas = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    });
    const keys = new EventTarget();
    const off = t.ic.attach(canvas, keys);
    const f = footOf(t.view, 0);
    const fire = (type: string, props: object) =>
      canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), ev(0), props));
    const at = { clientX: f.x + 10, clientY: f.y - 20 + 20 };
    fire('pointerdown', at);
    fire('pointerup', at);
    expect(t.ic.selection.eids).toEqual([t.view.eid(0)]);
    const cm = Object.assign(new Event('contextmenu', { cancelable: true }));
    canvas.dispatchEvent(cm);
    expect(cm.defaultPrevented).toBe(true);
    off();
    t.ic.selection.clear();
    fire('pointerdown', at);
    fire('pointerup', at);
    expect(t.ic.selection.count).toBe(0);
  });

  it('dead units leave the selection on step()', () => {
    const t = setup(units);
    t.ic.selection.set([t.view.eid(0), 999]);
    t.ic.step(16);
    expect(t.ic.selection.eids).toEqual([t.view.eid(0)]);
  });
});
