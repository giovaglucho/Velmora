// ADR-006 §5 — selection model. The cap comes from data (game.json selection.maxUnits). The eid list is
// always ascending and unique; changes notify subscribers synchronously (events, never per frame).
import type { SnapshotView } from '../worker/snapshot';
import { isAliveEid } from './picking';

export type SelectionListener = (eids: readonly number[]) => void;

export class SelectionModel {
  private ids: number[] = [];
  private readonly listeners = new Set<SelectionListener>();

  constructor(private readonly maxUnits: number) {
    if (!Number.isInteger(maxUnits) || maxUnits < 1)
      throw new Error('maxUnits must be a positive integer');
  }

  get eids(): readonly number[] {
    return this.ids;
  }
  get count(): number {
    return this.ids.length;
  }
  has(eid: number): boolean {
    return this.ids.includes(eid);
  }

  /** Subscribe to changes; returns the unsubscribe function. */
  subscribe(cb: SelectionListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private commit(next: number[]): void {
    const uniq = Array.from(new Set(next)).sort((a, b) => a - b);
    // Over the cap: keep the lowest eids (deterministic; the oldest units).
    const capped = uniq.length > this.maxUnits ? uniq.slice(0, this.maxUnits) : uniq;
    if (capped.length === this.ids.length && capped.every((v, i) => v === this.ids[i])) return;
    this.ids = capped;
    for (const cb of [...this.listeners]) cb(this.ids);
  }

  clear(): void {
    this.commit([]);
  }

  /** Replace the selection. */
  set(eids: readonly number[]): void {
    this.commit([...eids]);
  }

  /** Click on one unit (or on the ground with null). Shift toggles the unit. */
  click(eid: number | null, shift: boolean): void {
    if (eid === null) {
      if (!shift) this.clear();
      return;
    }
    if (!shift) return this.commit([eid]);
    this.commit(this.has(eid) ? this.ids.filter((v) => v !== eid) : [...this.ids, eid]);
  }

  /** Box result: Shift adds to the current selection, otherwise replaces it. */
  box(eids: readonly number[], shift: boolean): void {
    if (!shift) return this.commit([...eids]);
    if (eids.length === 0) return;
    this.commit([...this.ids, ...eids]);
  }

  /** Drops units that died or no longer exist in the snapshot. */
  prune(view: SnapshotView): void {
    this.commit(this.ids.filter((e) => isAliveEid(view, e)));
  }
}
