// ADR-006 §5 — picking against a SnapshotView. Pure: no DOM, no Pixi. Uses the same interpolated
// position as the renderer so what you click is what you see.
import { TILE_FX } from '@reinos/shared';
import { FLAG_ALIVE } from '../worker/snapshot';
import type { SnapshotView } from '../worker/snapshot';
import type { Camera, Viewport } from '../render/types';
import { CLICK_THRESHOLD_PX, HIT_MIN_RX_PX, HIT_RY_OVER_RX } from './constants';
import type { InputGeometry } from './geometry';

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PickContext {
  view: SnapshotView;
  cam: Camera;
  vp: Viewport;
  geo: InputGeometry;
  /** Interpolation factor of the current frame (same value the renderer uses). */
  alpha: number;
  localPlayer: number;
  /** Fog: is the tile currently visible to the local player? Omitted = no fog. */
  isTileVisible?: (tx: number, ty: number) => boolean;
  /** Allies are always pickable even in fog. */
  isAlly?: (owner: number) => boolean;
  /** Unit radius in Fx by typeId (from data); omitted = minimum hit size. */
  radiusFxOfType?: (typeId: number) => number;
}

const FX_PER_TILE = TILE_FX;

export function isAliveSlot(view: SnapshotView, slot: number): boolean {
  return slot >= 0 && slot < view.highWater && ((view.flags[slot] ?? 0) & FLAG_ALIVE) !== 0;
}

/** True when `eid` still names a live entity in this snapshot (slot reused => gen differs). */
export function isAliveEid(view: SnapshotView, eid: number): boolean {
  const slot = eid & 0xffff;
  return isAliveSlot(view, slot) && view.eid(slot) === eid;
}

function seenByLocal(ctx: PickContext, slot: number): boolean {
  const { view, localPlayer } = ctx;
  const owner = view.owner[slot] ?? 255;
  if (owner === localPlayer || ctx.isAlly?.(owner)) return true;
  if (!ctx.isTileVisible) return true;
  const tx = Math.floor((view.posX[slot] ?? 0) / FX_PER_TILE);
  const ty = Math.floor((view.posY[slot] ?? 0) / FX_PER_TILE);
  return ctx.isTileVisible(tx, ty);
}

/** Screen position of the unit's foot (anchor) at the interpolated position. */
export function footScreen(ctx: PickContext, slot: number): { sx: number; sy: number } {
  const p = ctx.geo.interpolatedPos(ctx.view, slot, ctx.alpha);
  const w = ctx.geo.gridToWorld(p.x / FX_PER_TILE, p.y / FX_PER_TILE);
  const s = ctx.geo.worldToScreen(ctx.cam, ctx.vp, w.x, w.y);
  return { sx: s.x, sy: s.y };
}

function hitRx(ctx: PickContext, slot: number): number {
  let rx = HIT_MIN_RX_PX;
  const r = ctx.radiusFxOfType?.(ctx.view.typeId[slot] ?? 0);
  if (r !== undefined && r > 0) rx = Math.max(rx, ctx.geo.ellipseForRadius(r).rx);
  return rx * ctx.cam.zoomT;
}

/**
 * Front-most pickable unit under (sx, sy) or null. The hit ellipse is centred one `ry` above the foot so
 * it spans from the feet up to the head; candidates win by depth key (front-most first).
 */
export function pickPoint(ctx: PickContext, sx: number, sy: number): number | null {
  const { view } = ctx;
  let best = -1;
  let bestKey = -Infinity;
  for (let slot = 0; slot < view.highWater; slot++) {
    if (!isAliveSlot(view, slot) || !seenByLocal(ctx, slot)) continue;
    const foot = footScreen(ctx, slot);
    const rx = hitRx(ctx, slot);
    const ry = rx * HIT_RY_OVER_RX;
    const dx = (sx - foot.sx) / rx;
    const dy = (sy - (foot.sy - ry)) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const p = ctx.geo.interpolatedPos(view, slot, ctx.alpha);
    const key = ctx.geo.depthKey(Math.round(p.x), Math.round(p.y), slot);
    if (key > bestKey) {
      bestKey = key;
      best = slot;
    }
  }
  return best < 0 ? null : view.eid(best);
}

export function rectIsClick(r: ScreenRect): boolean {
  return Math.max(Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0)) < CLICK_THRESHOLD_PX;
}

/**
 * Own units whose foot falls inside `rect`, ascending by eid. A rect under the click threshold is treated
 * as a click on its centre (any owner, single unit), as in AoE2-style RTS input.
 */
export function pickBox(ctx: PickContext, rect: ScreenRect): number[] {
  if (rectIsClick(rect)) {
    const id = pickPoint(ctx, (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
    return id === null ? [] : [id];
  }
  const xa = Math.min(rect.x0, rect.x1);
  const xb = Math.max(rect.x0, rect.x1);
  const ya = Math.min(rect.y0, rect.y1);
  const yb = Math.max(rect.y0, rect.y1);
  const { view } = ctx;
  const out: number[] = [];
  for (let slot = 0; slot < view.highWater; slot++) {
    if (!isAliveSlot(view, slot) || view.owner[slot] !== ctx.localPlayer) continue;
    const f = footScreen(ctx, slot);
    if (f.sx >= xa && f.sx <= xb && f.sy >= ya && f.sy <= yb) out.push(view.eid(slot));
  }
  return out.sort((a, b) => a - b);
}

/** Own units of `typeId` currently on screen (double click / Ctrl+click), ascending by eid. */
export function pickSameTypeOnScreen(ctx: PickContext, typeId: number): number[] {
  const { view } = ctx;
  const out: number[] = [];
  for (let slot = 0; slot < view.highWater; slot++) {
    if (!isAliveSlot(view, slot)) continue;
    if (view.owner[slot] !== ctx.localPlayer || view.typeId[slot] !== typeId) continue;
    const f = footScreen(ctx, slot);
    if (ctx.geo.spriteVisible(f.sx, f.sy, ctx.cam.zoomT, ctx.vp)) out.push(view.eid(slot));
  }
  return out.sort((a, b) => a - b);
}

/** typeId of a live eid, or null. */
export function typeOfEid(view: SnapshotView, eid: number): number | null {
  return isAliveEid(view, eid) ? (view.typeId[eid & 0xffff] ?? null) : null;
}
