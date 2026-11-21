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

const SLOTS = 3;
const align4 = (n: number): number => (n + 3) & ~3;

/** Pure; both sides call it with the same `capacity`. Columns are 4-byte aligned, in ADR-006 §3.2 order. */
export function snapshotLayout(capacity: number): SnapshotLayout {
  if (!Number.isInteger(capacity) || capacity < 1)
    throw new RangeError('snapshot capacity must be a positive integer');
  const sizes: Record<SnapshotColumn, number> = {
    posX: 4,
    posY: 4,
    prevX: 4,
    prevY: 4,
    hp: 4,
    gen: 2,
    typeId: 2,
    facing: 2,
    owner: 1,
    flags: 1,
  };
  const offsets = {} as Record<SnapshotColumn, number>;
  let at = SNAPSHOT_HEADER_BYTES;
  for (const c of SNAPSHOT_COLUMNS) {
    offsets[c] = at;
    at = align4(at + capacity * sizes[c]);
  }
  return { totalBytes: at, offsets };
}

/** `64 + 3 × totalBytes` (ADR-006 §3.4). */
export function sharedSnapshotBytes(capacity: number): number {
  return SNAPSHOT_HEADER_BYTES + SLOTS * snapshotLayout(capacity).totalBytes;
}

/** True when SharedArrayBuffer snapshots are usable (cross-origin isolated + SAB present). */
export function sabAvailable(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  );
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

interface Columns {
  header: Int32Array;
  posX: Int32Array;
  posY: Int32Array;
  prevX: Int32Array;
  prevY: Int32Array;
  hp: Int32Array;
  gen: Uint16Array;
  typeId: Uint16Array;
  facing: Uint16Array;
  owner: Uint8Array;
  flags: Uint8Array;
}

function columnsOver(buffer: ArrayBufferLike, byteOffset: number, capacity: number): Columns {
  const { offsets: o } = snapshotLayout(capacity);
  const at = (c: SnapshotColumn): number => byteOffset + o[c];
  return {
    header: new Int32Array(buffer, byteOffset, SNAPSHOT_HEADER_INTS),
    posX: new Int32Array(buffer, at('posX'), capacity),
    posY: new Int32Array(buffer, at('posY'), capacity),
    prevX: new Int32Array(buffer, at('prevX'), capacity),
    prevY: new Int32Array(buffer, at('prevY'), capacity),
    hp: new Int32Array(buffer, at('hp'), capacity),
    gen: new Uint16Array(buffer, at('gen'), capacity),
    typeId: new Uint16Array(buffer, at('typeId'), capacity),
    facing: new Uint16Array(buffer, at('facing'), capacity),
    owner: new Uint8Array(buffer, at('owner'), capacity),
    flags: new Uint8Array(buffer, at('flags'), capacity),
  };
}

/** Builds a view over a buffer (reader). Header fields are read live, so one view tracks its slot. */
export function createSnapshotView(
  buffer: ArrayBufferLike,
  byteOffset: number,
  capacity: number,
): SnapshotView {
  const c = columnsOver(buffer, byteOffset, capacity);
  const h = c.header;
  if (h[H.magic] === SNAPSHOT_MAGIC && h[H.capacity] !== capacity)
    throw new RangeError('snapshot capacity mismatch');
  const gen = c.gen;
  return {
    get tick() {
      return h[H.tick] as number;
    },
    get turn() {
      return h[H.turn] as number;
    },
    get highWater() {
      return h[H.highWater] as number;
    },
    get count() {
      return h[H.count] as number;
    },
    get tickIntervalUs() {
      return h[H.tickIntervalUs] as number;
    },
    get mapW() {
      return h[H.mapW] as number;
    },
    get mapH() {
      return h[H.mapH] as number;
    },
    posX: c.posX,
    posY: c.posY,
    prevX: c.prevX,
    prevY: c.prevY,
    hp: c.hp,
    gen,
    typeId: c.typeId,
    facing: c.facing,
    owner: c.owner,
    flags: c.flags,
    eid: (slot: number): number => (((gen[slot] as number) << 16) | slot) >>> 0,
  };
}

/** Writer over one slot/buffer: `subarray().set` per column, `flags` composed in one loop. */
export function createSnapshotWriter(
  buffer: ArrayBufferLike,
  byteOffset: number,
  capacity: number,
): SnapshotWriter {
  const c = columnsOver(buffer, byteOffset, capacity);
  return {
    write(world, tick, turn, tickIntervalUs, mapW, mapH) {
      if (world.capacity !== capacity) throw new RangeError('snapshot capacity mismatch');
      const n = world.highWater;
      c.posX.set(world.posX.subarray(0, n));
      c.posY.set(world.posY.subarray(0, n));
      c.prevX.set(world.prevX.subarray(0, n));
      c.prevY.set(world.prevY.subarray(0, n));
      c.hp.set(world.hp.subarray(0, n));
      c.gen.set(world.gen.subarray(0, n));
      c.typeId.set(world.typeId.subarray(0, n));
      c.facing.set(world.facing.subarray(0, n));
      c.owner.set(world.owner.subarray(0, n));
      const flags = c.flags;
      for (let i = 0; i < n; i++) {
        if (world.alive[i] === 0) {
          flags[i] = 0;
          continue;
        }
        const moving = (world.velX[i] as number) !== 0 || (world.velY[i] as number) !== 0;
        flags[i] =
          FLAG_ALIVE |
          (moving ? FLAG_MOVING : 0) |
          (((world.orderKind[i] as number) & 3) << FLAG_ORDER_SHIFT);
      }
      const h = c.header;
      h[H.magic] = SNAPSHOT_MAGIC;
      h[H.version] = SNAPSHOT_VERSION;
      h[H.capacity] = capacity;
      h[H.tick] = tick;
      h[H.turn] = turn;
      h[H.highWater] = n;
      h[H.count] = world.count;
      h[H.tickIntervalUs] = tickIntervalUs;
      h[H.mapW] = mapW;
      h[H.mapH] = mapH;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Triple buffer (ADR-006 §3.4). The two sides are written as explicit step machines (one atomic
// operation per step) so tests can enumerate every interleaving of the REAL code; the runtime
// wrappers just run them to completion.

/** ctrl Int32 indices of the SAB control block. */
export const CTRL_LATEST = 0;
export const CTRL_READING = 1;
export const CTRL_PUBCOUNT = 2;

export interface TripleWriterState {
  /** 0 load latest, 1 load reading + pick, 2 writing (slot `w` is owned), 3 publish, 4 count, 5 done. */
  pc: number;
  l: number;
  r: number;
  w: number;
}
export interface TripleReaderState {
  /** 0 load latest, 1 store reading, 2 re-check latest, 3 done. */
  pc: number;
  s: number;
  /** Result when pc === 3: the slot to read, or -1 when nothing was published. */
  result: number;
}

export const newTripleWriter = (): TripleWriterState => ({ pc: 0, l: -1, r: -1, w: -1 });
export const newTripleReader = (): TripleReaderState => ({ pc: 0, s: -1, result: -1 });

/** One atomic operation of the writer. Step 2 is a no-op marker: the caller writes the slot there. */
export function tripleWriterStep(ctrl: Int32Array, st: TripleWriterState): void {
  switch (st.pc) {
    case 0:
      st.l = Atomics.load(ctrl, CTRL_LATEST);
      st.pc = 1;
      return;
    case 1: {
      st.r = Atomics.load(ctrl, CTRL_READING);
      let w = 0;
      while (w === st.l || w === st.r) w++;
      st.w = w;
      st.pc = 2;
      return;
    }
    case 2:
      st.pc = 3;
      return;
    case 3:
      Atomics.store(ctrl, CTRL_LATEST, st.w);
      st.pc = 4;
      return;
    case 4:
      Atomics.add(ctrl, CTRL_PUBCOUNT, 1);
      st.pc = 5;
      return;
    default:
      return;
  }
}

/** One atomic operation of the reader (`latest()` loop of ADR-006 §3.4). */
export function tripleReaderStep(ctrl: Int32Array, st: TripleReaderState): void {
  switch (st.pc) {
    case 0:
      st.s = Atomics.load(ctrl, CTRL_LATEST);
      if (st.s < 0) {
        st.result = -1;
        st.pc = 3;
      } else st.pc = 1;
      return;
    case 1:
      Atomics.store(ctrl, CTRL_READING, st.s);
      st.pc = 2;
      return;
    case 2:
      if (Atomics.load(ctrl, CTRL_LATEST) === st.s) {
        st.result = st.s;
        st.pc = 3;
      } else st.pc = 0;
      return;
    default:
      return;
  }
}

/** Creates the SharedArrayBuffer (main thread) with the control block initialised (latest = reading = -1). */
export function createSharedSnapshotBuffer(capacity: number): SharedArrayBuffer {
  const sab = new SharedArrayBuffer(sharedSnapshotBytes(capacity));
  const ctrl = new Int32Array(sab, 0, SNAPSHOT_HEADER_INTS);
  Atomics.store(ctrl, CTRL_LATEST, -1);
  Atomics.store(ctrl, CTRL_READING, -1);
  return sab;
}

/** Worker side of the `sab` transport. */
export interface SnapshotPublisher {
  readonly mode: SnapshotMode;
  /** Publishes the world; false if it had to be skipped (transfer: no free buffer). */
  publish(
    world: World,
    tick: number,
    turn: number,
    tickIntervalUs: number,
    mapW: number,
    mapH: number,
  ): boolean;
}

export function createSabPublisher(sab: SharedArrayBuffer, capacity: number): SnapshotPublisher {
  const { totalBytes } = snapshotLayout(capacity);
  if (sab.byteLength < sharedSnapshotBytes(capacity)) throw new RangeError('SAB too small');
  const ctrl = new Int32Array(sab, 0, SNAPSHOT_HEADER_INTS);
  const writers: SnapshotWriter[] = [];
  for (let s = 0; s < SLOTS; s++)
    writers.push(createSnapshotWriter(sab, SNAPSHOT_HEADER_BYTES + s * totalBytes, capacity));
  const st = newTripleWriter();
  return {
    mode: 'sab',
    publish(world, tick, turn, tickIntervalUs, mapW, mapH) {
      st.pc = 0;
      while (st.pc < 2) tripleWriterStep(ctrl, st);
      (writers[st.w] as SnapshotWriter).write(world, tick, turn, tickIntervalUs, mapW, mapH);
      while (st.pc < 5) tripleWriterStep(ctrl, st);
      return true;
    },
  };
}

/** Main-thread side of the `sab` transport. */
export function createSabSource(sab: SharedArrayBuffer, capacity: number): SnapshotSource {
  const { totalBytes } = snapshotLayout(capacity);
  const ctrl = new Int32Array(sab, 0, SNAPSHOT_HEADER_INTS);
  const views: SnapshotView[] = [];
  for (let s = 0; s < SLOTS; s++)
    views.push(createSnapshotView(sab, SNAPSHOT_HEADER_BYTES + s * totalBytes, capacity));
  const st = newTripleReader();
  return {
    mode: 'sab',
    latest() {
      st.pc = 0;
      while (st.pc < 3) tripleReaderStep(ctrl, st);
      return st.result < 0 ? null : (views[st.result] as SnapshotView);
    },
    dispose() {},
  };
}

// ---------------------------------------------------------------------------------------------
// `transfer` transport (ADR-006 §3.3): pool of 3 ArrayBuffers + recycling.

export interface TransferPublisher extends SnapshotPublisher {
  /** A buffer came back from the main thread (ignored if it has the wrong size). */
  recycle(buffer: ArrayBuffer): void;
  /** Publications skipped for lack of a free buffer. */
  readonly skipped: number;
}

export function createTransferPublisher(
  capacity: number,
  post: (msg: { t: 'snap'; tick: number; buffer: ArrayBuffer }, transfer: Transferable[]) => void,
): TransferPublisher {
  const { totalBytes } = snapshotLayout(capacity);
  // LIFO stack of free buffers, preallocated; no allocation on publish.
  const free: (ArrayBuffer | undefined)[] = new Array<ArrayBuffer | undefined>(SLOTS * 2).fill(
    undefined,
  );
  let top = 0;
  let skipped = 0;
  for (let i = 0; i < SLOTS; i++) free[top++] = new ArrayBuffer(totalBytes);
  return {
    mode: 'transfer',
    get skipped() {
      return skipped;
    },
    recycle(buffer) {
      if (buffer.byteLength !== totalBytes || top >= free.length) return;
      free[top++] = buffer;
    },
    publish(world, tick, turn, tickIntervalUs, mapW, mapH) {
      if (top === 0) {
        skipped++;
        return false;
      }
      const buffer = free[--top] as ArrayBuffer;
      free[top] = undefined;
      createSnapshotWriter(buffer, 0, capacity).write(
        world,
        tick,
        turn,
        tickIntervalUs,
        mapW,
        mapH,
      );
      post({ t: 'snap', tick, buffer }, [buffer]);
      return true;
    },
  };
}

export interface TransferSource extends SnapshotSource {
  /** A `snap` message arrived. Older un-consumed buffers are recycled immediately. */
  push(buffer: ArrayBuffer): void;
}

/** Main-thread side of the `transfer` transport; `recycle` returns buffers to the worker. */
export function createTransferSource(
  capacity: number,
  recycle: (buffer: ArrayBuffer) => void,
): TransferSource {
  let current: ArrayBuffer | null = null;
  let currentView: SnapshotView | null = null;
  let pending: ArrayBuffer | null = null;
  return {
    mode: 'transfer',
    push(buffer) {
      if (pending !== null) recycle(pending);
      pending = buffer;
    },
    latest() {
      if (pending !== null) {
        if (current !== null) recycle(current);
        current = pending;
        pending = null;
        currentView = createSnapshotView(current, 0, capacity);
      }
      return currentView;
    },
    dispose() {
      current = null;
      currentView = null;
      pending = null;
    },
  };
}
