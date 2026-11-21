// Fake SnapshotSource for fog/minimap tests (ADR-006 §3.5 types only; no worker, no sim).
import type { SnapshotMode } from '../../../src/worker/protocol';
import { FLAG_ALIVE, type SnapshotSource, type SnapshotView } from '../../../src/worker/snapshot';

export interface FakeUnit {
  /** Position in Fx (1/1000 tile). */
  x: number;
  y: number;
  owner: number;
  typeId: number;
  alive?: boolean;
}

export class FakeSnapshotSource implements SnapshotSource {
  readonly mode: SnapshotMode = 'transfer';
  private tick = 0;
  private readonly posX: Int32Array;
  private readonly posY: Int32Array;
  private readonly prevX: Int32Array;
  private readonly prevY: Int32Array;
  private readonly hp: Int32Array;
  private readonly gen: Uint16Array;
  private readonly typeId: Uint16Array;
  private readonly facing: Uint16Array;
  private readonly owner: Uint8Array;
  private readonly flags: Uint8Array;
  private high = 0;

  constructor(
    readonly capacity: number,
    readonly mapW: number,
    readonly mapH: number,
  ) {
    this.posX = new Int32Array(capacity);
    this.posY = new Int32Array(capacity);
    this.prevX = new Int32Array(capacity);
    this.prevY = new Int32Array(capacity);
    this.hp = new Int32Array(capacity);
    this.gen = new Uint16Array(capacity);
    this.typeId = new Uint16Array(capacity);
    this.facing = new Uint16Array(capacity);
    this.owner = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
  }

  set(slot: number, u: FakeUnit): void {
    this.prevX[slot] = this.posX[slot] ?? 0;
    this.prevY[slot] = this.posY[slot] ?? 0;
    this.posX[slot] = u.x;
    this.posY[slot] = u.y;
    this.owner[slot] = u.owner;
    this.typeId[slot] = u.typeId;
    this.hp[slot] = 100;
    this.flags[slot] = u.alive === false ? 0 : FLAG_ALIVE;
    if (slot + 1 > this.high) this.high = slot + 1;
  }

  kill(slot: number): void {
    this.flags[slot] = 0;
  }

  latest(): SnapshotView {
    this.tick++;
    const gen = this.gen;
    return {
      tick: this.tick,
      turn: this.tick >> 2,
      highWater: this.high,
      count: this.high,
      tickIntervalUs: 50_000,
      mapW: this.mapW,
      mapH: this.mapH,
      posX: this.posX,
      posY: this.posY,
      prevX: this.prevX,
      prevY: this.prevY,
      hp: this.hp,
      gen: this.gen,
      typeId: this.typeId,
      facing: this.facing,
      owner: this.owner,
      flags: this.flags,
      eid: (slot: number) => ((gen[slot] ?? 0) << 16) | slot,
    };
  }

  dispose(): void {}
}
