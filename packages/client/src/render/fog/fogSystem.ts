// ADR-006 §7.3 — glue between VisionGrid and the consumers (FogRenderer, minimap, unit layer).
// PURE (no Pixi, no DOM, no clock): owns the combined FOG_* tile array for the local player and answers
// "is this entity visible?" with the decision of the PREVIOUS update (ADR-006 §7.3, entities).
import { FX_SCALE } from '@reinos/shared';
import { FLAG_ALIVE, type SnapshotView } from '../../worker/snapshot';
import { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE, VisionGrid } from './visionGrid';

export interface FogSystemOptions {
  width: number;
  height: number;
  maxPlayers: number;
  /** Snapshot capacity (slots). */
  capacity: number;
  /** Line of sight in whole tiles, indexed by typeId (from units.json `los`). */
  losTilesByType: ArrayLike<number>;
}

export class FogSystem {
  readonly grid: VisionGrid;
  /** Combined (own ∪ allies) FOG_* per tile. Stable identity; contents change in place. */
  readonly states: Uint8Array;
  private readonly los: ArrayLike<number>;
  private localPlayer = 0;
  private mask = 1;
  private dirty = true;

  constructor(opts: FogSystemOptions) {
    this.grid = new VisionGrid(opts.width, opts.height, opts.maxPlayers, opts.capacity);
    this.states = new Uint8Array(opts.width * opts.height);
    this.los = opts.losTilesByType;
  }

  get width(): number {
    return this.grid.width;
  }
  get height(): number {
    return this.grid.height;
  }
  get player(): number {
    return this.localPlayer;
  }
  /** Players whose vision the local player shares (bit p), including itself. */
  get visionMask(): number {
    return this.mask;
  }

  /** `allyMask`: bit p for every ally of `id` (the local player is always included). */
  setLocalPlayer(id: number, allyMask = 0): void {
    this.localPlayer = id;
    this.mask = (allyMask | (1 << id)) >>> 0;
    this.dirty = true;
  }

  /** Feeds the snapshot; recomputes `states` only when something changed. Returns true if `states` changed. */
  update(view: SnapshotView): boolean {
    const changed = this.grid.update(view, this.los);
    if (changed || this.dirty) {
      this.grid.viewFor(this.mask, this.states);
      this.dirty = false;
      return true;
    }
    return false;
  }

  /** FOG_UNEXPLORED / FOG_EXPLORED / FOG_VISIBLE of tile (tx, ty) (out of map = unexplored). */
  fogState(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.grid.width || ty >= this.grid.height) return FOG_UNEXPLORED;
    return this.states[ty * this.grid.width + tx] ?? FOG_UNEXPLORED;
  }

  /**
   * Whether the sprite of `slot` should be drawn. Own and allied entities always are; enemy and neutral
   * ones only when their tile is currently VISIBLE (decision from the last `update`).
   */
  isSlotVisible(view: SnapshotView, slot: number): boolean {
    if (((view.flags[slot] ?? 0) & FLAG_ALIVE) === 0) return false;
    const o = view.owner[slot] ?? 255;
    if (o < 32 && ((this.mask >>> o) & 1) !== 0) return true;
    const tx = ((view.posX[slot] ?? 0) / FX_SCALE) | 0;
    const ty = ((view.posY[slot] ?? 0) / FX_SCALE) | 0;
    return this.fogState(tx, ty) === FOG_VISIBLE;
  }
}

export { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE };
