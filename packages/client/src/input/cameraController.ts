// ADR-006 §4.2, §8.2 — camera input: arrow keys, screen-edge scroll (with delay), middle-button drag and
// wheel zoom (3 levels, anchored to the cursor). Time is injected (step(dtMs)); tuning comes from game.json.
import { FX_SCALE } from '@reinos/shared';
import type { Camera, Viewport, ZoomIndex } from '../render/types';
import { WHEEL_STEP_DELTA } from './constants';
import type { InputConfig } from './config';
import type { InputGeometry } from './geometry';

export class CameraController {
  private readonly held = new Set<string>(); // 'left' | 'right' | 'up' | 'down' from keys
  private pointer: { x: number; y: number } | null = null;
  private edgeMs = 0;
  private wheelAcc = 0;

  constructor(
    private readonly cam: Camera,
    private readonly getViewport: () => Viewport,
    private readonly getMapSize: () => { w: number; h: number },
    private readonly cfg: InputConfig['camera'],
    private readonly geo: InputGeometry,
  ) {}

  /** Held arrow-key state (from the keymap `pan` action). */
  setPanKey(dx: -1 | 0 | 1, dy: -1 | 0 | 1, down: boolean): void {
    const names: string[] = [];
    if (dx < 0) names.push('left');
    if (dx > 0) names.push('right');
    if (dy < 0) names.push('up');
    if (dy > 0) names.push('down');
    for (const n of names) {
      if (down) this.held.add(n);
      else this.held.delete(n);
    }
  }

  releaseAllKeys(): void {
    this.held.clear();
    this.edgeMs = 0;
  }

  /** Pointer position in canvas CSS px; null when the pointer left the canvas. */
  setPointer(p: { x: number; y: number } | null): void {
    this.pointer = p;
  }

  /** Direction (-1,0,1) requested by the screen edge, ignoring the delay. */
  private edgeDir(): { x: number; y: number } {
    const p = this.pointer;
    if (!p) return { x: 0, y: 0 };
    const { vw, vh } = this.getViewport();
    const b = this.cfg.edgeBandPx;
    return {
      x: p.x <= b ? -1 : p.x >= vw - b ? 1 : 0,
      y: p.y <= b ? -1 : p.y >= vh - b ? 1 : 0,
    };
  }

  /** Advances pan and zoom by dtMs. Returns true if the camera moved or zoomed. */
  step(dtMs: number): boolean {
    const before = this.cam.x + this.cam.y * 1e-3 + this.cam.zoomT;
    let dx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    let dy = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);

    const edge = this.edgeDir();
    if (edge.x !== 0 || edge.y !== 0) {
      this.edgeMs += dtMs;
      if (this.edgeMs >= this.cfg.edgeDelayMs) {
        if (dx === 0) dx = edge.x;
        if (dy === 0) dy = edge.y;
      }
    } else this.edgeMs = 0;

    if (dx !== 0 || dy !== 0) {
      // Screen speed is constant: a world step is the screen step divided by the current zoom.
      const len = Math.hypot(dx, dy);
      const worldPx = (this.cfg.panSpeedPxPerS * dtMs) / 1000 / this.cam.zoomT / len;
      this.cam.x += dx * worldPx;
      this.cam.y += dy * worldPx;
    }
    this.geo.stepZoom(this.cam, dtMs, this.cfg.zoomTauMs);
    this.clamp();
    return before !== this.cam.x + this.cam.y * 1e-3 + this.cam.zoomT;
  }

  /** Middle-button drag: moves the world with the pointer (screen delta in CSS px). */
  dragPan(dxScreen: number, dyScreen: number): void {
    this.cam.x -= dxScreen / this.cam.zoomT;
    this.cam.y -= dyScreen / this.cam.zoomT;
    this.clamp();
  }

  /** Clamps only once the map size is known (first snapshot). */
  private clamp(): void {
    const { w, h } = this.getMapSize();
    if (w > 0 && h > 0) this.geo.clampCamera(this.cam, w, h);
  }

  /** Wheel zoom: one level per WHEEL_STEP_DELTA, scroll up = zoom in, stops at the extremes. */
  wheel(deltaY: number, anchorSx: number, anchorSy: number): void {
    this.wheelAcc += deltaY;
    while (Math.abs(this.wheelAcc) >= WHEEL_STEP_DELTA) {
      const dir = this.wheelAcc < 0 ? 1 : -1;
      this.wheelAcc += dir * WHEEL_STEP_DELTA;
      const next = Math.max(0, Math.min(2, this.cam.zoomIndex + dir)) as ZoomIndex;
      if (next !== this.cam.zoomIndex)
        this.geo.setZoomAnchored(this.cam, this.getViewport(), next, anchorSx, anchorSy);
    }
  }

  centerOnFx(fxX: number, fxY: number): void {
    this.geo.centerOnGrid(this.cam, fxX / FX_SCALE, fxY / FX_SCALE);
  }
}
