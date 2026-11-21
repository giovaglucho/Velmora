// ADR-006 §6 — control groups (Ctrl/Alt+0–9 store, 0–9 recall, double press centres the camera).
import type { SnapshotView } from '../worker/snapshot';
import { CONTROL_GROUP_COUNT, DOUBLE_PRESS_MS } from './constants';
import { isAliveEid } from './picking';

export interface RecallResult {
  /** Live members, ascending. */
  eids: number[];
  /** True when this press completes a double press: centre the camera on `centroidFx`. */
  center: boolean;
  centroidFx: { x: number; y: number } | null;
}

export class ControlGroups {
  private readonly groups: number[][] = Array.from({ length: CONTROL_GROUP_COUNT }, () => []);
  private lastRecallGroup = -1;
  private lastRecallMs = -Infinity;

  /** Stores a copy of `eids` (ascending, unique) in group `n`. An empty selection clears the group. */
  save(n: number, eids: readonly number[]): void {
    this.check(n);
    this.groups[n] = Array.from(new Set(eids)).sort((a, b) => a - b);
  }

  /** Alive members of group `n` in `view` (does not mutate the stored list). */
  members(n: number, view: SnapshotView): number[] {
    this.check(n);
    return (this.groups[n] ?? []).filter((e) => isAliveEid(view, e));
  }

  /** Group sizes for the HUD (alive members when a view is available). */
  sizes(view: SnapshotView | null): Array<{ size: number }> {
    return this.groups.map((g) => ({
      size: view ? g.filter((e) => isAliveEid(view, e)).length : g.length,
    }));
  }

  /** Recall group `n`; a second press of the same digit within DOUBLE_PRESS_MS asks to centre the camera. */
  recall(n: number, view: SnapshotView, nowMs: number): RecallResult {
    const eids = this.members(n, view);
    const center =
      eids.length > 0 && n === this.lastRecallGroup && nowMs - this.lastRecallMs < DOUBLE_PRESS_MS;
    this.lastRecallGroup = center ? -1 : n; // a third press starts a new pair
    this.lastRecallMs = nowMs;
    return { eids, center, centroidFx: center ? centroidFx(view, eids) : null };
  }

  private check(n: number): void {
    if (!Number.isInteger(n) || n < 0 || n >= CONTROL_GROUP_COUNT)
      throw new RangeError('group ' + n);
  }
}

/** Integer centroid (Fx) of the given live eids; null if none. */
export function centroidFx(
  view: SnapshotView,
  eids: readonly number[],
): { x: number; y: number } | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const e of eids) {
    if (!isAliveEid(view, e)) continue;
    const slot = e & 0xffff;
    sx += view.posX[slot] ?? 0;
    sy += view.posY[slot] ?? 0;
    n++;
  }
  return n === 0 ? null : { x: Math.round(sx / n), y: Math.round(sy / n) };
}
