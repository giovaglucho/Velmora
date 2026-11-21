import { describe, expect, it } from 'vitest';
import type { Command } from '@reinos/shared';
import { createCommandScheduler, createSimHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { DATA, SEED, makeHarness, moveCmd, newSim, type Harness } from './helpers';
import { buildScenario } from '../../src/worker/scenarios';

const turns = (h: Harness): Extract<FromWorker, { t: 'turn' }>[] =>
  h.msgs.filter((m): m is Extract<FromWorker, { t: 'turn' }> => m.t === 'turn');
const snaps = (h: Harness): Extract<FromWorker, { t: 'snap' }>[] =>
  h.msgs.filter((m): m is Extract<FromWorker, { t: 'snap' }> => m.t === 'snap');
const errors = (h: Harness): string[] =>
  h.msgs.flatMap((m) => (m.t === 'error' ? [m.message] : []));

function init(h: Harness, extra: Partial<Extract<ToWorker, { t: 'init' }>> = {}): void {
  h.host.onMessage({
    t: 'init',
    seed: SEED,
    config: buildScenario('demo100', SEED),
    speed: 1,
    mode: 'transfer',
    ...extra,
  });
}
const lastSnapTick = (h: Harness, _cap: number): number => h.lastSnap.tick;

describe('SimHost pacing', () => {
  it('posts the tick-0 snapshot, then ready (capacity, data version, effective mode)', () => {
    const h = makeHarness();
    init(h);
    expect(h.msgs.map((m) => m.t)).toEqual(['snap', 'ready']);
    const ready = h.msgs[1] as Extract<FromWorker, { t: 'ready' }>;
    expect(ready).toMatchObject({
      t: 'ready',
      capacity: 1024,
      dataVersion: DATA.dataVersion,
      simDataHash: null,
      mode: 'transfer',
    });
    expect(h.lastSnap.tick).toBe(0); // the render has something to draw at once
  });

  it('runs 20 ticks per second at speed 1 (fake clock)', () => {
    const h = makeHarness();
    init(h);
    h.advance(1000);
    expect(turns(h)).toHaveLength(5);
    h.advance(1000);
    expect(turns(h)).toHaveLength(10);
    // tick count shows in the snapshot header of the latest publication
    expect(lastSnapTick(h, 1024)).toBe(40);
  });

  it('honours speed changes (2x -> 40 ticks/s) and ignores invalid values', () => {
    const h = makeHarness();
    init(h);
    h.host.onMessage({ t: 'ctl', op: 'speed', value: 2 });
    h.advance(1000);
    expect(turns(h)).toHaveLength(10);
    h.host.onMessage({ t: 'ctl', op: 'speed', value: -3 });
    h.host.onMessage({ t: 'ctl', op: 'speed', value: Number.NaN });
    h.advance(1000);
    expect(turns(h)).toHaveLength(20);
  });

  it('batches at most 4 ticks per pump and drops the excess beyond 10 ticks behind', () => {
    const h = makeHarness();
    init(h);
    h.clock.t += 2000; // a 2 s stall = 40 ticks owed
    h.host.pump();
    expect(turns(h)).toHaveLength(1); // 4 ticks
    expect(lastSnapTick(h, 1024)).toBe(4); // one snapshot per pump (the batch's last tick)
    h.advance(100);
    // the excess was discarded: only a couple of ticks follow, not 36
    expect(turns(h).length).toBeLessThanOrEqual(2);
    h.advance(1000);
    h.msgs.length = 0;
    h.advance(1000);
    h.advance(1000);
    // perf reports the drop
    const perf = h.msgs.find((m) => m.t === 'perf') as Extract<FromWorker, { t: 'perf' }>;
    expect(perf.ticksDropped).toBe(1);
  });

  it('emits perf once per second with sane fields', () => {
    const h = makeHarness();
    init(h);
    h.advance(3004);
    const perfs = h.msgs.filter((m) => m.t === 'perf') as Extract<FromWorker, { t: 'perf' }>[];
    expect(perfs.length).toBe(3);
    for (const p of perfs) {
      expect(p.tickMsMax).toBeGreaterThanOrEqual(p.tickMsP95);
      expect(p.tickMsP95).toBeGreaterThanOrEqual(0);
      expect(p.ticksDropped).toBe(0);
    }
  });
});

describe('pause / step / resume', () => {
  it('start paused, step advances exactly one turn, step ignored while running', () => {
    const h = makeHarness();
    init(h, { paused: true });
    h.advance(2000);
    expect(turns(h)).toHaveLength(0);
    h.host.onMessage({ t: 'ctl', op: 'step' });
    expect(turns(h)).toHaveLength(1);
    expect(turns(h)[0]).toMatchObject({ turn: 0 });
    expect(lastSnapTick(h, 1024)).toBe(4);
    h.host.onMessage({ t: 'ctl', op: 'step' });
    expect(turns(h)).toHaveLength(2);
    h.host.onMessage({ t: 'ctl', op: 'resume' });
    h.host.onMessage({ t: 'ctl', op: 'step' }); // running: ignored
    expect(turns(h)).toHaveLength(2);
  });

  it('pause stops the clock; resume does not replay the paused time', () => {
    const h = makeHarness();
    init(h);
    h.advance(500);
    const before = turns(h).length;
    h.host.onMessage({ t: 'ctl', op: 'pause' });
    h.advance(10_000);
    expect(turns(h)).toHaveLength(before);
    h.host.onMessage({ t: 'ctl', op: 'resume' });
    h.advance(500);
    expect(turns(h).length - before).toBeLessThanOrEqual(3);
    expect(turns(h).length - before).toBeGreaterThanOrEqual(2);
  });
});

describe('commands', () => {
  it('are delivered only on turn boundaries, with `turn` rewritten (client sends turn 0)', () => {
    // The order is queued at tick 1; it must execute at tick 4 (turn 1), whatever `turn` says.
    const mid = makeHarness();
    init(mid);
    mid.advance(54); // exactly 1 tick done (tick % 4 = 1)
    mid.host.onMessage({ t: 'cmd', cmds: [{ ...moveCmd(0, 10, 100, 64), turn: 987654 }] });
    mid.advance(2000);
    // Headless equivalent: same order applied at turn 1.
    const { sim } = newSim();
    const expected: number[] = [];
    sim.step([]);
    expected.push(sim.hash());
    sim.step([moveCmd(1, 10, 100, 64)]);
    expected.push(sim.hash());
    for (let t = 2; t < 10; t++) {
      sim.step([]);
      expected.push(sim.hash());
    }
    expect(
      turns(mid)
        .slice(0, 10)
        .map((t) => t.hash),
    ).toEqual(expected);
    expect(errors(mid)).toEqual([]);
  });

  it('order -> first position change within 5 ticks (from every phase of the turn)', () => {
    const initialX = newSim().sim.world.posX[0] as number;
    for (const phaseMs of [4, 54, 104, 154, 204]) {
      const h = makeHarness();
      init(h);
      h.advance(phaseMs);
      const sentAt = h.lastSnap.tick;
      h.host.onMessage({ t: 'cmd', cmds: [moveCmd(0, 10, 100, 64)] });
      let changedAt = -1;
      for (let i = 0; i < 100 && changedAt < 0; i++) {
        h.advance(4);
        if (h.lastSnap.posX0 !== initialX) changedAt = h.lastSnap.tick;
      }
      expect(changedAt).toBeGreaterThan(0);
      expect(changedAt - sentAt).toBeLessThanOrEqual(5);
    }
  });

  it('malformed commands are discarded without throwing and counted in the next turn message', () => {
    const h = makeHarness();
    init(h);
    const bad: unknown[] = [
      null,
      42,
      'x',
      {},
      { ...moveCmd(0, 1, 1, 1), type: 'dance' },
      { ...moveCmd(0, 1, 1, 1), unitIds: [] },
      { ...moveCmd(0, 1, 1, 1), payload: 5 },
      { ...moveCmd(0, 1, 1, 1), playerId: 7 }, // well-formed but the match has 2 players
    ];
    expect(() => h.host.onMessage({ t: 'cmd', cmds: bad as Command[] })).not.toThrow();
    expect(() =>
      h.host.onMessage({ t: 'cmd', cmds: 'nope' as unknown as Command[] }),
    ).not.toThrow();
    h.advance(450);
    expect(turns(h)[0]?.rejected).toBe(9);
    expect(turns(h)[1]?.rejected).toBe(0);
    expect(errors(h)).toEqual([]);
    // the sim kept running and a valid command still works afterwards
    h.host.onMessage({ t: 'cmd', cmds: [moveCmd(0, 5, 100, 64)] });
    h.advance(500);
    expect(errors(h)).toEqual([]);
  });

  it('keeps arrival order and rewrites all queued commands to the same turn', () => {
    const s = createCommandScheduler();
    const a = moveCmd(0, 1, 1, 1);
    const b = { ...moveCmd(0, 2, 2, 2), turn: 99 };
    s.push([a]);
    s.push([b]);
    const out = s.drain(7);
    expect(out.map((c) => c.unitIds.length)).toEqual([1, 2]);
    expect(out.every((c) => c.turn === 7)).toBe(true);
    expect(a.turn).toBe(0); // inputs are not mutated
    expect(s.drain(8)).toEqual([]);
    const n2 = createCommandScheduler((t) => t + 2); // lockstep seam (F9)
    n2.push([a]);
    expect(n2.drain(5)[0]?.turn).toBe(7);
  });
});

describe('lifecycle errors', () => {
  it('a second init posts an error and does not restart', () => {
    const h = makeHarness();
    init(h);
    init(h);
    expect(errors(h)).toEqual(['init received twice']);
    expect(h.msgs.filter((m) => m.t === 'ready')).toHaveLength(1);
  });
  it('dataVersion mismatch -> error, no ready, no ticking', () => {
    const h = makeHarness();
    init(h, { dataVersion: '0.0.0-other' });
    expect(errors(h)[0]).toMatch(/dataVersion mismatch/);
    expect(h.msgs.some((m) => m.t === 'ready')).toBe(false);
    h.advance(1000);
    expect(turns(h)).toHaveLength(0);
  });
  it('an invalid config -> error message (no throw)', () => {
    const h = makeHarness();
    const cfg = buildScenario('demo100', SEED);
    expect(() => init(h, { config: { ...cfg, maxPlayers: 99 } })).not.toThrow();
    expect(errors(h)).toHaveLength(1);
  });
  it('sab requested without a buffer falls back to transfer', () => {
    const h = makeHarness();
    init(h, { mode: 'sab' });
    expect((h.msgs.find((m) => m.t === 'ready') as { mode: string }).mode).toBe('transfer');
  });
  it('messages before init and after stop are ignored', () => {
    const h = makeHarness();
    h.host.onMessage({ t: 'cmd', cmds: [moveCmd(0, 1, 1, 1)] });
    h.host.onMessage({ t: 'ctl', op: 'step' });
    h.advance(100);
    init(h);
    h.host.onMessage({ t: 'stop' });
    h.advance(1000);
    expect(turns(h)).toHaveLength(0);
    const standalone = createSimHost({ post: () => undefined, now: () => 0, data: DATA });
    expect(() => standalone.dispose()).not.toThrow();
  });
});

describe('transfer back-pressure', () => {
  it('without recycling the host skips publications, retries later and reports it in perf', () => {
    const h = makeHarness(false);
    init(h);
    h.advance(1000); // never recycled: 3 buffers in flight, rest skipped
    expect(snaps(h)).toHaveLength(3);
    expect(h.lastSnap.tick).toBeLessThan(20);
    h.host.onMessage({ t: 'ctl', op: 'pause' });
    h.host.onMessage({ t: 'recycle', buffer: (snaps(h)[0] as { buffer: ArrayBuffer }).buffer });
    h.advance(8); // the skipped publication is retried even though the sim is paused
    expect(snaps(h)).toHaveLength(4);
    expect(h.lastSnap.tick).toBe(20);
    const perf = h.msgs.filter((m) => m.t === 'perf').at(-1) as Extract<FromWorker, { t: 'perf' }>;
    expect(perf.snapsSkipped).toBeGreaterThan(0);
  });
});

describe('determinism: worker turn hashes == headless createSim + step', () => {
  it('matches for a fixed command script over 40 turns (transfer mode)', () => {
    const script = new Map<number, Command[]>([
      [0, [moveCmd(0, 50, 100, 64)]],
      [
        6,
        [
          moveCmd(0, 20, 30, 20),
          { ...moveCmd(0, 1, 1, 1), type: 'stop', target: null, unitIds: [(1 << 16) | 3] },
        ],
      ],
      [15, [moveCmd(0, 50, 64, 100)]],
    ]);
    const { sim } = newSim();
    const expected: { turn: number; hash: number }[] = [];
    for (let t = 0; t < 40; t++) {
      const cmds = (script.get(t) ?? []).map((c) => ({ ...c, turn: t }));
      const r = sim.step(cmds);
      expected.push({ turn: r.turn, hash: r.hash });
    }

    const h = makeHarness();
    init(h, { paused: true });
    for (let t = 0; t < 40; t++) {
      const cmds = script.get(t);
      if (cmds) h.host.onMessage({ t: 'cmd', cmds });
      h.host.onMessage({ t: 'ctl', op: 'step' });
    }
    const got = turns(h).map((m) => ({ turn: m.turn, hash: m.hash }));
    expect(got).toEqual(expected);
    h.host.onMessage({ t: 'probe', id: 7 });
    expect(h.msgs.at(-1)).toEqual({ t: 'probe', id: 7, hashFull: sim.hashFull() });
  });

  it('a free-running worker (real pacing, random pump jitter) yields the same per-turn hashes', () => {
    const { sim } = newSim();
    const expected: number[] = [];
    sim.step([moveCmd(0, 50, 100, 64)]);
    expected.push(sim.hash());
    for (let t = 1; t < 30; t++) expected.push(sim.step([]).hash);

    const h = makeHarness();
    h.host.onMessage({
      t: 'init',
      seed: SEED,
      config: buildScenario('demo100', SEED),
      speed: 1,
      mode: 'transfer',
      paused: true,
    });
    h.host.onMessage({ t: 'cmd', cmds: [moveCmd(0, 50, 100, 64)] });
    h.host.onMessage({ t: 'ctl', op: 'resume' });
    // jittery clock: uneven pump intervals (1..30 ms) from a tiny LCG
    let seed = 7;
    while (turns(h).length < 30) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      h.clock.t += 1 + ((seed >>> 8) % 30);
      h.host.pump();
    }
    expect(
      turns(h)
        .slice(0, 30)
        .map((m) => m.hash),
    ).toEqual(expected);
  });
});
