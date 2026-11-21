// ADR-006 §2 — InputController: wires selection, groups, orders, camera and the pointer router.
// main.ts (I1) creates it once the SimClient is ready and calls `step(dtMs)` from the render loop.
import type { Command } from '@reinos/shared';
import type { SnapshotView } from '../worker/snapshot';
import type { Camera, Viewport } from '../render/types';
import { CameraController } from './cameraController';
import type { InputConfig } from './config';
import { ControlGroups } from './controlGroups';
import type { InputGeometry } from './geometry';
import { OrderIssuer, type OrderMarkerSink } from './orders';
import type { ScreenRect } from './picking';
import { PointerRouter, type CanvasLike, type EventSource } from './pointerRouter';
import { SelectionModel } from './selection';

export interface InputControllerDeps {
  config: InputConfig;
  geo: InputGeometry;
  camera: Camera;
  getViewport: () => Viewport;
  getView: () => SnapshotView | null;
  getAlpha: () => number;
  localPlayer: () => number;
  now: () => number;
  send: (cmds: Command[]) => void;
  marker?: OrderMarkerSink;
  isTileVisible?: (tx: number, ty: number) => boolean;
  isAlly?: (owner: number) => boolean;
  radiusFxOfType?: (typeId: number) => number;
  onBox?: (rect: ScreenRect | null) => void;
}

export interface InputController {
  readonly selection: SelectionModel;
  readonly groups: ControlGroups;
  readonly orders: OrderIssuer;
  readonly cameraController: CameraController;
  readonly router: PointerRouter;
  /** Per-frame: camera movement, zoom easing and pruning of dead units from the selection. */
  step(dtMs: number): void;
  attach(canvas: CanvasLike, keys: EventSource): () => void;
  dispose(): void;
}

export function createInputController(d: InputControllerDeps): InputController {
  const selection = new SelectionModel(d.config.maxUnits);
  const groups = new ControlGroups();
  const mapSize = () => {
    const v = d.getView();
    return { w: v?.mapW ?? 0, h: v?.mapH ?? 0 };
  };
  const cameraController = new CameraController(
    d.camera,
    d.getViewport,
    mapSize,
    d.config.camera,
    d.geo,
  );
  const orders = new OrderIssuer({
    sink: { send: d.send },
    marker: d.marker,
    geo: d.geo,
    localPlayer: d.localPlayer,
    getView: d.getView,
    getCamera: () => d.camera,
    getViewport: d.getViewport,
    getSelection: () => selection.eids,
  });
  const router = new PointerRouter({
    geo: d.geo,
    selection,
    groups,
    orders,
    camera: cameraController,
    getView: d.getView,
    getCamera: () => d.camera,
    getViewport: d.getViewport,
    getAlpha: d.getAlpha,
    localPlayer: d.localPlayer,
    now: d.now,
    isTileVisible: d.isTileVisible,
    isAlly: d.isAlly,
    radiusFxOfType: d.radiusFxOfType,
    onBox: d.onBox,
  });
  return {
    selection,
    groups,
    orders,
    cameraController,
    router,
    step(dtMs) {
      cameraController.step(dtMs);
      const v = d.getView();
      if (v) selection.prune(v);
    },
    attach: (canvas, keys) => router.attach(canvas, keys),
    dispose: () => router.dispose(),
  };
}
