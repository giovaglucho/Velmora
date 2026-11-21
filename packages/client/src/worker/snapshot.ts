// ADR-006 §3.2–3.5 — snapshot layout, writer/reader and transports. Owner: sim-engineer (W).
// Pure (no DOM, no Pixi). render/ and input/ may import types and the reader from here.
import type { World } from '@reinos/sim';
import type { SnapshotMode } from './protocol';

export const SNAPSHOT_MAGIC = 0x534e4150; // "SNAP"
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_HEADER_INTS = 16;
export const SNAPSHOT_HEADER_BYTES = 64;
/** Header Int32 indices (ADR-006 §3.2). */
export const H = {
  magic: 0,
  version: 1,
  capacity: 2,
  tick: 3,
  turn: 4,
  highWater: 5,
  count: 6,
  tickIntervalUs: 7,
  mapW: 8,
  mapH: 9,
} as const;
/** `flags` bits: bit0 alive; bit1 moving; bits 2–3 orderKind. */
export const FLAG_ALIVE = 1;
export const FLAG_MOVING = 2;
export const FLAG_ORDER_SHIFT = 2;
export const OWNER_NEUTRAL = 255;

export type SnapshotColumn =
  'posX' | 'posY' | 'prevX' | 'prevY' | 'hp' | 'gen' | 'typeId' | 'facing' | 'owner' | 'flags';
/** Exact column order of ADR-006 §3.2. */
export const SNAPSHOT_COLUMNS: readonly SnapshotColumn[] = [
  'posX',
  'posY',
  'prevX',
  'prevY',
  'hp',
  'gen',
  'typeId',
  'facing',
  'owner',
  'flags',
];

export interface SnapshotLayout {
  totalBytes: number;
  offsets: Readonly<Record<SnapshotColumn, number>>;
}

/** Pure; both sides call it with the same `capacity`. */
export function snapshotLayout(_capacity: number): SnapshotLayout {
  throw new Error('TODO(W1): snapshotLayout');
}

/** `64 + 3 × totalBytes` (ADR-006 §3.4). */
export function sharedSnapshotBytes(_capacity: number): number {
  throw new Error('TODO(W1): sharedSnapshotBytes');
}

export interface SnapshotView {
  readonly tick: number;
  readonly turn: number;
  readonly highWater: number;
  readonly count: number;
  readonly tickIntervalUs: number;
  readonly mapW: number;
  readonly mapH: number;
  readonly posX: Int32Array;
  readonly posY: Int32Array;
  readonly prevX: Int32Array;
  readonly prevY: Int32Array;
  readonly hp: Int32Array;
  readonly gen: Uint16Array;
  readonly typeId: Uint16Array;
  readonly facing: Uint16Array;
  readonly owner: Uint8Array;
  readonly flags: Uint8Array;
  /** (gen << 16) | slot */
  eid(slot: number): number;
}

/** Worker side: writes the renderable state of `world` into a buffer laid out by snapshotLayout. */
export interface SnapshotWriter {
  write(
    world: World,
    tick: number,
    turn: number,
    tickIntervalUs: number,
    mapW: number,
    mapH: number,
  ): void;
}

/** Main-thread side: same interface for both transports (ADR-006 §3.3/3.4). */
export interface SnapshotSource {
  readonly mode: SnapshotMode;
  /** Latest snapshot or null; the view is valid only until the next call. */
  latest(): SnapshotView | null;
  dispose(): void;
}

/** Builds a view over a buffer (reader). */
export function createSnapshotView(
  _buffer: ArrayBufferLike,
  _byteOffset: number,
  _capacity: number,
): SnapshotView {
  throw new Error('TODO(W1): createSnapshotView');
}
