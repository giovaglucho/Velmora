import { describe, expect, it } from 'vitest';
import { createSim } from '@reinos/sim';
import {
  CTRL_LATEST,
  CTRL_PUBCOUNT,
  CTRL_READING,
  SNAPSHOT_COLUMNS,
  SNAPSHOT_HEADER_BYTES,
  createSabPublisher,
  createSabSource,
  createSharedSnapshotBuffer,
  createSnapshotView,
  createSnapshotWriter,
  createTransferPublisher,
  createTransferSource,
  newTripleReader,
  newTripleWriter,
  sharedSnapshotBytes,
  snapshotLayout,
  tripleReaderStep,
  tripleWriterStep,
  type SnapshotView,
  type TripleReaderState,
  type TripleWriterState,
} from '../../src/worker/snapshot';
import { DATA, moveCmd, newSim } from './helpers';

const COLS = ['posX', 'posY', 'prevX', 'prevY', 'hp', 'gen', 'typeId', 'facing', 'owner'] as const;

function expectViewMatchesWorld(view: SnapshotView, sim: ReturnType<typeof newSim>['sim']): void {
  const w = sim.world;
  expect(view.tick).toBe(sim.tick);
  expect(view.turn).toBe(sim.turn);
  expect(view.highWater).toBe(w.highWater);
  expect(view.count).toBe(w.count);
  for (const c of COLS) {
    expect(view[c].length).toBe(w.capacity);
    for (let i = 0; i < w.highWater; i++) expect(view[c][i]).toBe(w[c][i]);
  }
  for (let i = 0; i < w.highWater; i++) {
    const moving = w.velX[i] !== 0 || w.velY[i] !== 0;
    expect(view.flags[i]).toBe(1 | (moving ? 2 : 0) | (((w.orderKind[i] as number) & 3) << 2));
    expect(view.eid(i)).toBe((((w.gen[i] as number) << 16) | i) >>> 0);
  }
}

/** Sim with moving units (some orders issued) so velocity/order flags are non-trivial. */
function movingSim() {
  const s = newSim();
  s.sim.step([moveCmd(0, 20, 100, 64)]);
  s.sim.step([]);
  return s;
}

describe('snapshotLayout', () => {
  it('has 4-byte aligned, non-overlapping columns in ADR order, inside totalBytes', () => {
    for (const cap of [1, 2, 3, 7, 100, 1024, 4096]) {
      const { offsets, totalBytes } = snapshotLayout(cap);
      const sizes = [4, 4, 4, 4, 4, 2, 2, 2, 1, 1];
      let end = SNAPSHOT_HEADER_BYTES;
      SNAPSHOT_COLUMNS.forEach((c, k) => {
        expect(offsets[c] % 4).toBe(0);
        expect(offsets[c]).toBeGreaterThanOrEqual(end);
        end = offsets[c] + cap * (sizes[k] as number);
      });
      expect(end).toBeLessThanOrEqual(totalBytes);
      expect(totalBytes % 4).toBe(0);
      expect(sharedSnapshotBytes(cap)).toBe(64 + 3 * totalBytes);
    }
  });
  it('is ~64 + 28*capacity bytes', () => {
    expect(snapshotLayout(4096).totalBytes).toBeLessThan(64 + 28 * 4096 + 32);
  });
  it('rejects a bad capacity', () => {
    expect(() => snapshotLayout(0)).toThrow(RangeError);
  });
});

describe('snapshot round trip against a real World', () => {
  it('writer -> view is bit exact (single buffer)', () => {
    const { sim, config } = movingSim();
    const buf = new ArrayBuffer(snapshotLayout(config.maxEntities).totalBytes);
    createSnapshotWriter(buf, 0, config.maxEntities).write(
      sim.world,
      sim.tick,
      sim.turn,
      50000,
      128,
      128,
    );
    const view = createSnapshotView(buf, 0, config.maxEntities);
    expectViewMatchesWorld(view, sim);
    expect(view.tickIntervalUs).toBe(50000);
    expect(view.mapW).toBe(128);
    expect(view.mapH).toBe(128);
    expect(
      Array.from({ length: sim.world.highWater }, (_, i) => view.flags[i]).some(
        (f) => ((f as number) & 2) !== 0,
      ),
    ).toBe(true);
  });

  it('transfer mode: publisher -> source, with recycling', () => {
    const { sim, config } = movingSim();
    const cap = config.maxEntities;
    const sent: { tick: number; buffer: ArrayBuffer }[] = [];
    const pub = createTransferPublisher(cap, (m) => sent.push(m));
    const returned: ArrayBuffer[] = [];
    const src = createTransferSource(cap, (b) => {
      returned.push(b);
      pub.recycle(b);
    });
    expect(src.latest()).toBeNull();
    expect(pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128)).toBe(true);
    const first = sent.at(-1) as { buffer: ArrayBuffer };
    src.push(first.buffer);
    const v1 = src.latest() as SnapshotView;
    expectViewMatchesWorld(v1, sim);
    sim.step([]);
    pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128);
    src.push((sent.at(-1) as { buffer: ArrayBuffer }).buffer);
    const v2 = src.latest() as SnapshotView;
    expectViewMatchesWorld(v2, sim);
    expect(returned).toHaveLength(1); // v1's buffer went back
    expect(returned[0]).toBe(first.buffer);
  });

  it('transfer mode: several snaps before a read -> only the newest is used, the rest recycled', () => {
    const { sim, config } = movingSim();
    const cap = config.maxEntities;
    const sent: ArrayBuffer[] = [];
    const pub = createTransferPublisher(cap, (m) => sent.push(m.buffer));
    const returned: ArrayBuffer[] = [];
    const src = createTransferSource(cap, (b) => returned.push(b));
    for (let k = 0; k < 3; k++) {
      pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128);
      src.push(sent.at(-1) as ArrayBuffer);
      if (k < 2) sim.step([]);
    }
    expect(returned).toHaveLength(2);
    expectViewMatchesWorld(src.latest() as SnapshotView, sim);
  });

  it('transfer mode: skips (and counts) when every buffer is in flight, resumes after recycle', () => {
    const { sim, config } = movingSim();
    const sent: ArrayBuffer[] = [];
    const pub = createTransferPublisher(config.maxEntities, (m) => sent.push(m.buffer));
    for (let k = 0; k < 3; k++) expect(pub.publish(sim.world, 1, 0, 50000, 128, 128)).toBe(true);
    expect(pub.publish(sim.world, 1, 0, 50000, 128, 128)).toBe(false);
    expect(pub.skipped).toBe(1);
    pub.recycle(sent[0] as ArrayBuffer);
    expect(pub.publish(sim.world, 1, 0, 50000, 128, 128)).toBe(true);
    pub.recycle(new ArrayBuffer(8)); // wrong size: ignored
    expect(pub.publish(sim.world, 1, 0, 50000, 128, 128)).toBe(false);
  });

  it('sab mode: publisher -> source is bit exact and returns null before the first publish', () => {
    const { sim, config } = movingSim();
    const cap = config.maxEntities;
    const sab = createSharedSnapshotBuffer(cap);
    const pub = createSabPublisher(sab, cap);
    const src = createSabSource(sab, cap);
    expect(src.latest()).toBeNull();
    for (let k = 0; k < 5; k++) {
      pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128);
      expectViewMatchesWorld(src.latest() as SnapshotView, sim);
      sim.step([]);
    }
    const ctrl = new Int32Array(sab, 0, 16);
    expect(Atomics.load(ctrl, CTRL_PUBCOUNT)).toBe(5);
  });

  it('sab mode: a slot held by the reader is never overwritten by the writer', () => {
    const { sim, config } = movingSim();
    const cap = config.maxEntities;
    const sab = createSharedSnapshotBuffer(cap);
    const pub = createSabPublisher(sab, cap);
    const src = createSabSource(sab, cap);
    pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128);
    const held = src.latest() as SnapshotView;
    const heldTick = held.tick;
    const heldX = held.posX[0];
    for (let k = 0; k < 10; k++) {
      sim.step([]);
      pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128);
      expect(held.tick).toBe(heldTick);
      expect(held.posX[0]).toBe(heldX);
    }
    expect((src.latest() as SnapshotView).tick).toBe(sim.tick);
  });
});

describe('0 ArrayBuffer allocations in steady state', () => {
  it('transfer publisher + source + recycle loop allocates no ArrayBuffer after warm-up', () => {
    const { sim, config } = movingSim();
    const cap = config.maxEntities;
    const sent: ArrayBuffer[] = [];
    const pub = createTransferPublisher(cap, (m) => sent.push(m.buffer));
    const src = createTransferSource(cap, (b) => pub.recycle(b));
    const cycle = (): void => {
      sim.stepTick();
      if (pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128))
        src.push(sent.pop() as ArrayBuffer);
      src.latest();
    };
    for (let i = 0; i < 20; i++) cycle();
    const Real = globalThis.ArrayBuffer;
    let allocs = 0;
    globalThis.ArrayBuffer = new Proxy(Real, {
      construct(target, args, nt) {
        allocs++;
        return Reflect.construct(target, args, nt) as object;
      },
    });
    try {
      for (let i = 0; i < 400; i++) cycle();
    } finally {
      globalThis.ArrayBuffer = Real;
    }
    expect(allocs).toBe(0);
    expect(pub.skipped).toBe(0);
  });
  it('sab publisher/source allocate nothing per publish', () => {
    const { sim, config } = movingSim();
    const cap = config.maxEntities;
    const sab = createSharedSnapshotBuffer(cap);
    const pub = createSabPublisher(sab, cap);
    const src = createSabSource(sab, cap);
    const Real = globalThis.ArrayBuffer;
    const RealSab = globalThis.SharedArrayBuffer;
    let allocs = 0;
    const count = <T extends object>(C: T): T =>
      new Proxy(C, {
        construct(target, args, nt) {
          allocs++;
          return Reflect.construct(target as never, args, nt) as object;
        },
      });
    globalThis.ArrayBuffer = count(Real);
    globalThis.SharedArrayBuffer = count(RealSab);
    try {
      for (let i = 0; i < 400; i++) {
        sim.stepTick();
        pub.publish(sim.world, sim.tick, sim.turn, 50000, 128, 128);
        src.latest();
      }
    } finally {
      globalThis.ArrayBuffer = Real;
      globalThis.SharedArrayBuffer = RealSab;
    }
    expect(allocs).toBe(0);
  });
});

// --- exhaustive interleaving of the triple buffer (3 slots) ---------------------------------

interface Model {
  ctrl: Int32Array;
  /** 0 = never written, -1 = being written, n > 0 = fully published snapshot number n. */
  content: number[];
  wr: TripleWriterState;
  publishes: number;
  rd: TripleReaderState;
  acquisitions: number; // reader calls started
  held: number; // slot held after a completed acquisition, -1 if none
  heldStamp: number;
  lastStamp: number;
}

const clone = (m: Model): Model => ({
  ctrl: Int32Array.from(m.ctrl),
  content: [...m.content],
  wr: { ...m.wr },
  publishes: m.publishes,
  rd: { ...m.rd },
  acquisitions: m.acquisitions,
  held: m.held,
  heldStamp: m.heldStamp,
  lastStamp: m.lastStamp,
});
const key = (m: Model): string =>
  [
    m.ctrl[0],
    m.ctrl[1],
    m.ctrl[2],
    m.content.join(','),
    m.wr.pc,
    m.wr.l,
    m.wr.r,
    m.wr.w,
    m.publishes,
    m.rd.pc,
    m.rd.s,
    m.rd.result,
    m.acquisitions,
    m.held,
    m.heldStamp,
    m.lastStamp,
  ].join('|');

/** Explores every interleaving (memoised by state) and returns the number of invariant violations. */
function explore(brokenWriter: boolean): {
  violations: number;
  states: number;
  successes: number;
  nulls: number;
} {
  const PUBLISHES = 4;
  const ACQUISITIONS = 3;
  const init: Model = {
    ctrl: new Int32Array(16),
    content: [0, 0, 0],
    wr: newTripleWriter(),
    publishes: 0,
    rd: { pc: 3, s: -1, result: -1 },
    acquisitions: 0,
    held: -1,
    heldStamp: 0,
    lastStamp: 0,
  };
  init.ctrl[CTRL_LATEST] = -1;
  init.ctrl[CTRL_READING] = -1;
  let violations = 0;
  let successes = 0;
  let nulls = 0;
  const seen = new Set<string>();

  const stepWriter = (m: Model): void => {
    if (m.wr.pc >= 5) {
      m.wr = newTripleWriter();
      m.publishes++;
    }
    const before = m.wr.pc;
    if (brokenWriter && before === 1) {
      // mutation: ignores ctrl[reading] when choosing the slot
      m.wr.r = -1;
      let w = 0;
      while (w === m.wr.l) w++;
      m.wr.w = w;
      m.wr.pc = 2;
    } else tripleWriterStep(m.ctrl, m.wr);
    if (before === 1) m.content[m.wr.w] = -1; // slot acquired: writing may start at any time
    if (before === 2) m.content[m.wr.w] = m.publishes + 1; // write complete (stamp = publish number)
  };
  const stepReader = (m: Model): void => {
    if (m.rd.pc >= 3) {
      m.rd = newTripleReader();
      m.acquisitions++;
      m.held = -1; // the previous view is invalidated by the next latest() call
    }
    tripleReaderStep(m.ctrl, m.rd);
    if (m.rd.pc !== 3) return;
    if (m.rd.result < 0) {
      nulls++;
      return;
    }
    successes++;
    const stamp = m.content[m.rd.result] as number;
    if (stamp <= 0 || stamp < m.lastStamp) violations++; // partially written or going back in time
    m.held = m.rd.result;
    m.heldStamp = stamp;
    m.lastStamp = stamp;
  };

  const stack: Model[] = [init];
  while (stack.length > 0) {
    const m = stack.pop() as Model;
    const k = key(m);
    if (seen.has(k)) continue;
    seen.add(k);
    if (m.held >= 0 && m.content[m.held] !== m.heldStamp) violations++; // written while held
    if (m.wr.pc < 5 || m.publishes + 1 < PUBLISHES) {
      const n = clone(m);
      stepWriter(n);
      stack.push(n);
    }
    if (m.rd.pc < 3 || m.acquisitions < ACQUISITIONS) {
      const n = clone(m);
      stepReader(n);
      stack.push(n);
    }
  }
  return { violations, states: seen.size, successes, nulls };
}

describe('triple buffer: every interleaving of writer and reader steps', () => {
  it('never returns a slot being written, never changes a held slot, stamps are monotonic', () => {
    const r = explore(false);
    expect(r.states).toBeGreaterThan(1000);
    expect(r.successes).toBeGreaterThan(0);
    expect(r.nulls).toBeGreaterThan(0);
    expect(r.violations).toBe(0);
  });

  it('the exploration does detect a broken protocol (writer ignoring `reading`)', () => {
    expect(explore(true).violations).toBeGreaterThan(0);
  });
});

describe('dataVersion is irrelevant to snapshots (sanity: createSim with real data)', () => {
  it('real data builds a sim', () => {
    expect(DATA.unitIds.length).toBeGreaterThan(0);
    expect(typeof createSim).toBe('function');
  });
});
