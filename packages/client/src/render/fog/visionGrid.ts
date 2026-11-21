// ADR-006 §7.2 — reference-counted visibility grid. PURE, integers only (portable to the sim in F4;
// kept clean for `lint:sim`). Owner: render-engineer (2nd) (R5).
//
// Model: every live slot with an owner < maxPlayers and a line of sight `los > 0` (tiles) contributes
// +1 to `refs[owner]` over the disc dx² + dy² ≤ los² centred on its tile. A slot that moves to another
// tile, changes owner/radius or dies applies the delta (subtract the old disc, add the new one). A tile
// with refs > 0 is "visible" for that player and is latched into `explored` (monotonic).
// Allies are united only when queried (`viewFor(mask)`), never stored.
import { FX_SCALE, isqrt } from '@reinos/shared';
import { FLAG_ALIVE, type SnapshotView } from '../../worker/snapshot';

export const FOG_UNEXPLORED = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

/** Upper bound of a line of sight in tiles; bounds the cost of one disc (≈ 3.14·r² tiles). Structural, not balance. */
export const MAX_LOS_TILES = 64;
const NO_TILE = -1;
const NO_OWNER = 255;

export class VisionGrid {
  private readonly size: number;
  private readonly refsByPlayer: Uint16Array[] = [];
  private readonly exploredByPlayer: Uint8Array[] = [];
  /** Per-slot previously applied state: tile index (or NO_TILE), radius, owner. */
  private readonly slotTile: Int32Array;
  private readonly slotRadius: Uint8Array;
  private readonly slotOwner: Uint8Array;
  private appliedHigh = 0;
  /** rowHalf[r][dy + r] = half-width of the disc row at offset dy (lazy, built with isqrt only). */
  private readonly discs: (Int32Array | undefined)[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly maxPlayers: number,
    readonly capacity: number,
  ) {
    this.size = width * height;
    for (let p = 0; p < maxPlayers; p++) {
      this.refsByPlayer.push(new Uint16Array(this.size));
      this.exploredByPlayer.push(new Uint8Array(this.size));
    }
    this.slotTile = new Int32Array(capacity).fill(NO_TILE);
    this.slotRadius = new Uint8Array(capacity);
    this.slotOwner = new Uint8Array(capacity).fill(NO_OWNER);
  }

  /** Row half-widths of the disc of radius `r` (rows -r..r), cached. */
  private disc(r: number): Int32Array {
    let d = this.discs[r];
    if (d === undefined) {
      d = new Int32Array(2 * r + 1);
      for (let dy = -r; dy <= r; dy++) d[dy + r] = isqrt(r * r - dy * dy);
      this.discs[r] = d;
    }
    return d;
  }

  /** Number of tiles of the (unclipped) disc of radius `r`: Σ (2·w + 1). */
  diskSize(r: number): number {
    if (r <= 0) return 0;
    const d = this.disc(r);
    let n = 0;
    for (let i = 0; i < d.length; i++) n += 2 * (d[i] ?? 0) + 1;
    return n;
  }

  private applyDisc(player: number, tile: number, r: number, delta: 1 | -1): void {
    const refs = this.refsByPlayer[player];
    const explored = this.exploredByPlayer[player];
    if (refs === undefined || explored === undefined) return;
    const w = this.width;
    const h = this.height;
    const ty = (tile / w) | 0;
    const tx = tile - ty * w;
    const rows = this.disc(r);
    for (let dy = -r; dy <= r; dy++) {
      const y = ty + dy;
      if (y < 0 || y >= h) continue;
      const half = rows[dy + r] ?? 0;
      const x0 = tx - half < 0 ? 0 : tx - half;
      const x1 = tx + half >= w ? w - 1 : tx + half;
      let i = y * w + x0;
      const end = y * w + x1;
      if (delta === 1) {
        for (; i <= end; i++) {
          refs[i] = (refs[i] ?? 0) + 1;
          explored[i] = 1;
        }
      } else {
        for (; i <= end; i++) refs[i] = (refs[i] ?? 0) - 1;
      }
    }
  }

  /**
   * Syncs with the snapshot: per live slot, applies the delta if (tile, radius, owner, alive) changed.
   * `losTilesByType[typeId]` is the line of sight in whole tiles (0 / missing = no vision).
   * Returns true when any reference count changed.
   */
  update(view: SnapshotView, losTilesByType: ArrayLike<number>): boolean {
    const high = Math.min(Math.max(view.highWater, this.appliedHigh), this.capacity);
    const viewHigh = Math.min(view.highWater, this.capacity);
    const w = this.width;
    const maxX = w - 1;
    const maxY = this.height - 1;
    let changed = false;
    for (let slot = 0; slot < high; slot++) {
      let tile = NO_TILE;
      let radius = 0;
      let owner = NO_OWNER;
      if (slot < viewHigh && ((view.flags[slot] ?? 0) & FLAG_ALIVE) !== 0) {
        const o = view.owner[slot] ?? NO_OWNER;
        let r = losTilesByType[view.typeId[slot] ?? 0] ?? 0;
        if (r > MAX_LOS_TILES) r = MAX_LOS_TILES;
        if (o < this.maxPlayers && r > 0) {
          let tx = ((view.posX[slot] ?? 0) / FX_SCALE) | 0;
          let ty = ((view.posY[slot] ?? 0) / FX_SCALE) | 0;
          if (tx < 0) tx = 0;
          else if (tx > maxX) tx = maxX;
          if (ty < 0) ty = 0;
          else if (ty > maxY) ty = maxY;
          tile = ty * w + tx;
          radius = r | 0;
          owner = o;
        }
      }
      const oldTile = this.slotTile[slot] ?? NO_TILE;
      const oldRadius = this.slotRadius[slot] ?? 0;
      const oldOwner = this.slotOwner[slot] ?? NO_OWNER;
      if (tile === oldTile && radius === oldRadius && owner === oldOwner) continue;
      if (oldTile !== NO_TILE) this.applyDisc(oldOwner, oldTile, oldRadius, -1);
      if (tile !== NO_TILE) this.applyDisc(owner, tile, radius, 1);
      this.slotTile[slot] = tile;
      this.slotRadius[slot] = radius;
      this.slotOwner[slot] = owner;
      changed = true;
    }
    this.appliedHigh = viewHigh > this.appliedHigh ? viewHigh : this.appliedHigh;
    return changed;
  }

  /** Reference count per tile (length W*H). */
  refs(player: number): Uint16Array {
    const r = this.refsByPlayer[player];
    if (r === undefined) throw new RangeError('VisionGrid.refs: bad player ' + player);
    return r;
  }

  /** 0/1, monotonic. */
  explored(player: number): Uint8Array {
    const e = this.exploredByPlayer[player];
    if (e === undefined) throw new RangeError('VisionGrid.explored: bad player ' + player);
    return e;
  }

  /**
   * Combined (own ∪ allies) FOG_* per tile: `playerMask` has bit `p` set for every player whose vision
   * is shared with the viewer. VISIBLE if any has refs > 0, else EXPLORED if any explored, else UNEXPLORED.
   */
  viewFor(playerMask: number, out: Uint8Array): void {
    const n = this.size;
    out.fill(FOG_UNEXPLORED, 0, n);
    for (let p = 0; p < this.maxPlayers; p++) {
      if (((playerMask >>> p) & 1) === 0) continue;
      const refs = this.refsByPlayer[p];
      const explored = this.exploredByPlayer[p];
      if (refs === undefined || explored === undefined) continue;
      for (let i = 0; i < n; i++) {
        const s = (refs[i] ?? 0) > 0 ? FOG_VISIBLE : (explored[i] ?? 0);
        if (s > (out[i] ?? 0)) out[i] = s;
      }
    }
  }
}
