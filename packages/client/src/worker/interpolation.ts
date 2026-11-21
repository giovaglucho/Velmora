// ADR-006 §3.7 — prev→pos interpolation helpers (pure, no clock: `now` comes in as a parameter).
// The Renderer may use these or inline the same math; the contract is the formulas below.
import type { SnapshotView } from './snapshot';
import { FLAG_ALIVE } from './snapshot';

/** alpha = clamp((now - arrival) / (tickIntervalUs / 1000), 0, 1); saturates at 1 (no extrapolation). */
export function interpAlpha(nowMs: number, arrivalMs: number, tickIntervalUs: number): number {
  const interval = tickIntervalUs / 1000;
  if (!(interval > 0)) return 1;
  const a = (nowMs - arrivalMs) / interval;
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

/** True when the slot must not be interpolated (spawn, teleport: any axis jumps more than `maxJumpFx`). */
export function isDiscontinuity(
  view: SnapshotView,
  slot: number,
  maxJumpFx: number,
  wasAlive: boolean,
): boolean {
  if (!wasAlive || ((view.flags[slot] as number) & FLAG_ALIVE) === 0) return true;
  const dx = (view.posX[slot] as number) - (view.prevX[slot] as number);
  const dy = (view.posY[slot] as number) - (view.prevY[slot] as number);
  return Math.abs(dx) > maxJumpFx || Math.abs(dy) > maxJumpFx;
}

/** Interpolated position in Fx for one slot (floats are fine here: client code). */
export function interpolateSlot(
  view: SnapshotView,
  slot: number,
  alpha: number,
  maxJumpFx: number,
  wasAlive: boolean,
  out: { x: number; y: number },
): void {
  const px = view.posX[slot] as number;
  const py = view.posY[slot] as number;
  if (isDiscontinuity(view, slot, maxJumpFx, wasAlive)) {
    out.x = px;
    out.y = py;
    return;
  }
  const qx = view.prevX[slot] as number;
  const qy = view.prevY[slot] as number;
  out.x = qx + (px - qx) * alpha;
  out.y = qy + (py - qy) * alpha;
}
