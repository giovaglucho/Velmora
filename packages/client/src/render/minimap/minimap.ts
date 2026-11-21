// ADR-006 §7.4 — Canvas2D minimap at 10 Hz. Owner: render-engineer (2nd) (R7).
//
// Layers: (1) terrain pre-rasterised once, (2) fog blended per pixel from the FogSystem states, (3) unit dots
// 2×2 px (own/allied in player colour; enemy/neutral only on VISIBLE tiles), (4) camera quadrilateral.
// Time comes in as a parameter (`update(nowMs, ...)`); the draw is throttled to `hz`.
import { FX_SCALE } from '@reinos/shared';
import { FLAG_ALIVE, type SnapshotView } from '../../worker/snapshot';
import { PLAYER_COLORS } from '../constants';
import { FOG_VISIBLE } from '../fog/visionGrid';
import type { Vec2 } from '../types';
import { clampGrid, gridToMinimap, minimapToGrid } from './mapping';
import { applyFog, buildTileIndex, rasterTerrain } from './raster';

export const MINIMAP_W = 256;
export const MINIMAP_H = 128;
export const MINIMAP_HZ = 10;
const NEUTRAL_COLOR = '#9ca3af';

export interface MinimapOptions {
  canvas: HTMLCanvasElement;
  mapW: number;
  mapH: number;
  /** 0xRRGGBB of tile `ty·mapW + tx` (mean colour of the terrain layer). */
  terrainRgb: (tile: number) => number;
  /** Frames per second of the redraw (default 10). */
  hz?: number;
}

export interface MinimapFrame {
  view: SnapshotView | null;
  /** FOG_* per tile of the local player (FogSystem.states); null = no fog (everything visible). */
  fog: Uint8Array | null;
  /** Local player and the bitmask of players it shares vision with (including itself). */
  localPlayer: number;
  visionMask: number;
  /** Four viewport corners projected to grid coordinates (any winding); null = do not draw. */
  cameraGrid: readonly Vec2[] | null;
}

export interface MinimapHandlers {
  /** Left click / drag: centre the camera on this grid point (already clamped to the map). */
  onNavigate(gx: number, gy: number): void;
  /** Right click: order at this grid point (clamped). */
  onOrder?(gx: number, gy: number): void;
}

const css = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export class Minimap {
  readonly width = MINIMAP_W;
  readonly height = MINIMAP_H;
  /** Number of draws since creation (the 10 Hz throttle is testable through it). */
  draws = 0;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly mapW: number;
  private readonly mapH: number;
  private readonly tileIndex: Int32Array;
  private readonly base: Uint8ClampedArray;
  private readonly image: ImageData;
  private readonly intervalMs: number;
  private lastDrawMs = -Infinity;
  private detach: (() => void) | null = null;

  constructor(private readonly opts: MinimapOptions) {
    this.mapW = opts.mapW;
    this.mapH = opts.mapH;
    this.intervalMs = 1000 / (opts.hz ?? MINIMAP_HZ);
    opts.canvas.width = MINIMAP_W;
    opts.canvas.height = MINIMAP_H;
    const ctx = opts.canvas.getContext('2d');
    if (ctx === null) throw new Error('Minimap: 2d context unavailable');
    this.ctx = ctx;
    this.tileIndex = buildTileIndex(opts.mapW, opts.mapH, MINIMAP_W, MINIMAP_H);
    this.base = new Uint8ClampedArray(MINIMAP_W * MINIMAP_H * 4);
    rasterTerrain(this.tileIndex, opts.terrainRgb, this.base);
    this.image = ctx.createImageData(MINIMAP_W, MINIMAP_H);
  }

  /** Throttled entry point: draws when ≥ 1/hz has elapsed since the last draw. Returns true if it drew. */
  update(nowMs: number, frame: () => MinimapFrame): boolean {
    if (nowMs - this.lastDrawMs < this.intervalMs) return false;
    this.lastDrawMs = nowMs;
    this.draw(frame());
    return true;
  }

  draw(f: MinimapFrame): void {
    const ctx = this.ctx;
    applyFog(this.base, this.tileIndex, f.fog, this.image.data);
    ctx.putImageData(this.image, 0, 0);
    if (f.view !== null) this.drawUnits(f.view, f);
    if (f.cameraGrid !== null && f.cameraGrid.length >= 3) this.drawCamera(f.cameraGrid);
    this.draws++;
  }

  private drawUnits(view: SnapshotView, f: MinimapFrame): void {
    const ctx = this.ctx;
    let last = '';
    const n = Math.min(view.highWater, view.posX.length);
    for (let s = 0; s < n; s++) {
      if (((view.flags[s] ?? 0) & FLAG_ALIVE) === 0) continue;
      const gx = (view.posX[s] ?? 0) / FX_SCALE;
      const gy = (view.posY[s] ?? 0) / FX_SCALE;
      const owner = view.owner[s] ?? 255;
      const friendly = owner < 32 && ((f.visionMask >>> owner) & 1) !== 0;
      if (!friendly && f.fog !== null) {
        const tx = Math.floor(gx);
        const ty = Math.floor(gy);
        if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) continue;
        if (f.fog[ty * this.mapW + tx] !== FOG_VISIBLE) continue;
      }
      const color =
        owner < 32 ? css(PLAYER_COLORS[owner % PLAYER_COLORS.length] ?? 0xffffff) : NEUTRAL_COLOR;
      if (color !== last) {
        ctx.fillStyle = color;
        last = color;
      }
      const m = gridToMinimap(gx, gy, this.mapW, this.mapH, MINIMAP_W, MINIMAP_H);
      ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 2, 2);
    }
  }

  private drawCamera(corners: readonly Vec2[]): void {
    const ctx = this.ctx;
    ctx.beginPath();
    corners.forEach((c, i) => {
      const m = gridToMinimap(c.x, c.y, this.mapW, this.mapH, MINIMAP_W, MINIMAP_H);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  /** Grid point (clamped to the map) under a pointer event. */
  gridAt(clientX: number, clientY: number): Vec2 {
    const r = this.opts.canvas.getBoundingClientRect();
    const mx = ((clientX - r.left) * MINIMAP_W) / (r.width || MINIMAP_W);
    const my = ((clientY - r.top) * MINIMAP_H) / (r.height || MINIMAP_H);
    const g = minimapToGrid(mx, my, this.mapW, this.mapH, MINIMAP_W, MINIMAP_H);
    return clampGrid(g.x, g.y, this.mapW, this.mapH);
  }

  /** Left click/drag navigates, right click orders (context menu suppressed). Returns the detach function. */
  attachInput(h: MinimapHandlers): () => void {
    this.detach?.();
    const cv = this.opts.canvas;
    let dragging = false;
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      const g = this.gridAt(e.clientX, e.clientY);
      if (e.button === 0) {
        dragging = true;
        cv.setPointerCapture(e.pointerId);
        h.onNavigate(g.x, g.y);
      } else if (e.button === 2) h.onOrder?.(g.x, g.y);
    };
    const move = (e: PointerEvent): void => {
      if (!dragging) return;
      const g = this.gridAt(e.clientX, e.clientY);
      h.onNavigate(g.x, g.y);
    };
    const up = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      dragging = false;
      if (cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    };
    const ctxm = (e: Event): void => e.preventDefault();
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', ctxm);
    this.detach = () => {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('contextmenu', ctxm);
      this.detach = null;
    };
    return this.detach;
  }

  dispose(): void {
    this.detach?.();
  }
}
