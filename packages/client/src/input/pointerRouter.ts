// ADR-006 §8.2 — pointer/keyboard events of the canvas → intentions. Imperative, outside React.
// States: idle | boxSelecting | panning. (Minimap drag lives on the minimap canvas; it calls
// OrderIssuer.moveToGrid / CameraController.centerOnFx directly.)
import type { SnapshotView } from '../worker/snapshot';
import type { Camera, Viewport } from '../render/types';
import { DOUBLE_CLICK_MS } from './constants';
import type { CameraController } from './cameraController';
import type { ControlGroups } from './controlGroups';
import type { InputGeometry } from './geometry';
import type { OrderIssuer } from './orders';
import {
  pickBox,
  pickPoint,
  pickSameTypeOnScreen,
  rectIsClick,
  typeOfEid,
  type PickContext,
  type ScreenRect,
} from './picking';
import { resolveKey, type KeyBinding, type KeyLike } from './keymap';
import type { SelectionModel } from './selection';

export type RouterState = 'idle' | 'boxSelecting' | 'panning';

/** Structural subset of PointerEvent / MouseEvent / WheelEvent / KeyboardEvent the router reads. */
export interface PointerLike {
  button: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  preventDefault(): void;
}
export interface WheelLike extends PointerLike {
  deltaY: number;
}
export interface KeyEventLike extends KeyLike {
  preventDefault(): void;
  target?: unknown;
}

export interface EventSource {
  addEventListener(type: string, fn: (e: Event) => void, opts?: unknown): void;
  removeEventListener(type: string, fn: (e: Event) => void, opts?: unknown): void;
}
export interface CanvasLike extends EventSource {
  getBoundingClientRect(): { left: number; top: number };
}

export interface RouterDeps {
  geo: InputGeometry;
  selection: SelectionModel;
  groups: ControlGroups;
  orders: OrderIssuer;
  camera: CameraController;
  getView: () => SnapshotView | null;
  getCamera: () => Camera;
  getViewport: () => Viewport;
  /** Interpolation factor for the current frame (see geometry.interpolationAlpha). */
  getAlpha: () => number;
  localPlayer: () => number;
  /** Monotonic ms clock (performance.now in production, fake in tests). */
  now: () => number;
  isTileVisible?: (tx: number, ty: number) => boolean;
  isAlly?: (owner: number) => boolean;
  radiusFxOfType?: (typeId: number) => number;
  /** Rubber-band rectangle for the DOM overlay (null = hide). */
  onBox?: (rect: ScreenRect | null) => void;
  keymap?: readonly KeyBinding[];
}

export class PointerRouter {
  state: RouterState = 'idle';
  private start = { x: 0, y: 0 };
  private cur = { x: 0, y: 0 };
  private lastPan = { x: 0, y: 0 };
  private lastClick: { eid: number; ms: number } | null = null;
  private teardown: Array<() => void> = [];

  constructor(private readonly d: RouterDeps) {}

  private ctx(): PickContext | null {
    const view = this.d.getView();
    if (!view) return null;
    return {
      view,
      cam: this.d.getCamera(),
      vp: this.d.getViewport(),
      geo: this.d.geo,
      alpha: this.d.getAlpha(),
      localPlayer: this.d.localPlayer(),
      isTileVisible: this.d.isTileVisible,
      isAlly: this.d.isAlly,
      radiusFxOfType: this.d.radiusFxOfType,
    };
  }

  // ----- pointer (coordinates already relative to the canvas, CSS px) -----

  pointerDown(e: PointerLike, x: number, y: number): void {
    this.cur = { x, y };
    if (e.button === 0) {
      this.state = 'boxSelecting';
      this.start = { x, y };
    } else if (e.button === 1) {
      e.preventDefault();
      this.state = 'panning';
      this.lastPan = { x, y };
    } else if (e.button === 2) {
      e.preventDefault();
      this.d.orders.moveToScreen(x, y); // marker + command in the same event: inputToMarker ≤ 1 frame
    }
  }

  pointerMove(x: number, y: number): void {
    this.cur = { x, y };
    this.d.camera.setPointer({ x, y });
    if (this.state === 'boxSelecting') {
      const r = this.rect();
      this.d.onBox?.(rectIsClick(r) ? null : r);
    } else if (this.state === 'panning') {
      this.d.camera.dragPan(x - this.lastPan.x, y - this.lastPan.y);
      this.lastPan = { x, y };
    }
  }

  pointerUp(e: PointerLike, x: number, y: number): void {
    this.cur = { x, y };
    if (e.button === 1 && this.state === 'panning') this.state = 'idle';
    if (e.button !== 0 || this.state !== 'boxSelecting') return;
    this.state = 'idle';
    this.d.onBox?.(null);
    const ctx = this.ctx();
    if (!ctx) return;
    const rect = this.rect();
    if (rectIsClick(rect)) this.click(ctx, x, y, e);
    else this.d.selection.box(pickBox(ctx, rect), e.shiftKey);
  }

  /** Pointer left the canvas / window lost focus: cancel gestures and edge scroll. */
  pointerLeave(): void {
    this.d.camera.setPointer(null);
    if (this.state !== 'idle') {
      this.state = 'idle';
      this.d.onBox?.(null);
    }
  }

  private click(ctx: PickContext, x: number, y: number, e: PointerLike): void {
    const eid = pickPoint(ctx, x, y);
    const now = this.d.now();
    const double =
      eid !== null &&
      this.lastClick !== null &&
      this.lastClick.eid === eid &&
      now - this.lastClick.ms < DOUBLE_CLICK_MS;
    this.lastClick = eid === null ? null : { eid, ms: now };
    const typeId = eid === null ? null : typeOfEid(ctx.view, eid);
    const own = eid !== null && ctx.view.owner[eid & 0xffff] === ctx.localPlayer;
    if (eid !== null && typeId !== null && own && (double || e.ctrlKey)) {
      this.lastClick = null;
      this.d.selection.box(pickSameTypeOnScreen(ctx, typeId), e.shiftKey);
      return;
    }
    this.d.selection.click(eid, e.shiftKey);
  }

  wheel(e: WheelLike, x: number, y: number): void {
    e.preventDefault();
    this.d.camera.wheel(e.deltaY, x, y);
  }

  private rect(): ScreenRect {
    return { x0: this.start.x, y0: this.start.y, x1: this.cur.x, y1: this.cur.y };
  }

  // ----- keyboard -----

  keyDown(e: KeyEventLike): void {
    if (isEditable(e.target)) return;
    const action = resolveKey(e, this.d.keymap);
    if (!action) return;
    e.preventDefault();
    switch (action.kind) {
      case 'pan':
        this.d.camera.setPanKey(action.dx, action.dy, true);
        break;
      case 'stop':
        this.d.orders.stop();
        break;
      case 'groupSave':
        this.d.groups.save(action.group, this.d.selection.eids);
        break;
      case 'groupRecall': {
        const view = this.d.getView();
        if (!view) break;
        const r = this.d.groups.recall(action.group, view, this.d.now());
        this.d.selection.set(r.eids);
        if (r.center && r.centroidFx) this.d.camera.centerOnFx(r.centroidFx.x, r.centroidFx.y);
        break;
      }
    }
  }

  keyUp(e: KeyEventLike): void {
    const action = resolveKey(
      { code: e.code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
      this.d.keymap,
    );
    if (action?.kind === 'pan') this.d.camera.setPanKey(action.dx, action.dy, false);
  }

  // ----- DOM wiring -----

  /** Attaches listeners; `keys` is usually `window`. Returns the detach function (also called by dispose). */
  attach(canvas: CanvasLike, keys: EventSource): () => void {
    const rel = (e: PointerLike) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const on = <E>(t: EventSource, type: string, fn: (e: E) => void) => {
      t.addEventListener(type, fn as (e: Event) => void);
      this.teardown.push(() => t.removeEventListener(type, fn as (e: Event) => void));
    };
    on<PointerLike>(canvas, 'pointerdown', (e) => this.pointerDown(e, rel(e).x, rel(e).y));
    on<PointerLike>(canvas, 'pointermove', (e) => this.pointerMove(rel(e).x, rel(e).y));
    on<PointerLike>(canvas, 'pointerup', (e) => this.pointerUp(e, rel(e).x, rel(e).y));
    on<unknown>(canvas, 'pointerleave', () => this.pointerLeave());
    on<WheelLike>(canvas, 'wheel', (e) => this.wheel(e, rel(e).x, rel(e).y));
    on<{ preventDefault(): void }>(canvas, 'contextmenu', (e) => e.preventDefault());
    on<KeyEventLike>(keys, 'keydown', (e) => this.keyDown(e));
    on<KeyEventLike>(keys, 'keyup', (e) => this.keyUp(e));
    on<unknown>(keys, 'blur', () => {
      this.d.camera.releaseAllKeys();
      this.pointerLeave();
    });
    return () => this.dispose();
  }

  dispose(): void {
    for (const t of this.teardown) t();
    this.teardown = [];
  }
}

function isEditable(t: unknown): boolean {
  const el = t as { tagName?: string; isContentEditable?: boolean } | null | undefined;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}
