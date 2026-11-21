// ADR-006 §7.2 — reference-counted visibility grid. PURE, integers only (portable to the sim in F4;
// keep it clean for `lint:sim`). Owner: render-engineer (2nd) (R5).
import type { SnapshotView } from '../../worker/snapshot';

export const FOG_UNEXPLORED = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

export class VisionGrid {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly maxPlayers: number,
    readonly capacity: number,
  ) {}

  /** Syncs with the snapshot: per live slot, applies the delta if (tile, radius, owner, alive) changed. */
  update(_view: SnapshotView, _losTilesByType: ArrayLike<number>): boolean {
    throw new Error('TODO(R5): VisionGrid.update');
  }
  /** Reference count per tile (length W*H). */
  refs(_player: number): Uint16Array {
    throw new Error('TODO(R5): VisionGrid.refs');
  }
  /** 0/1, monotonic. */
  explored(_player: number): Uint8Array {
    throw new Error('TODO(R5): VisionGrid.explored');
  }
  /** Combined (own ∪ allies) FOG_* per tile. */
  viewFor(_playerMask: number, _out: Uint8Array): void {
    throw new Error('TODO(R5): VisionGrid.viewFor');
  }
}
