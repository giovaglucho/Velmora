import { afterEach, describe, expect, it } from 'vitest';
import { createSimClient, type SimClient, type WorkerLike } from '../../src/worker/client';
import { createSimHost, type SimHost } from '../../src/worker/host';
import { interpAlpha, interpolateSlot } from '../../src/worker/interpolation';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { buildScenario } from '../../src/worker/scenarios';
import { DATA, SEED, moveCmd, newSim } from './helpers';

/** In-process "Worker": client.postMessage -> host.onMessage, host.post -> client.onmessage. */
function loopback(): {
  worker: WorkerLike;
  host: () => SimHost;
  clock: { t: number };
  sent: ToWorker[];
  pump(ms: number): void;
} {
  const clock = { t: 5000 };
  const sent: ToWorker[] = [];
  let host: SimHost | null = null;
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(msg) {
      sent.push(msg);
      host?.onMessage(msg);
    },
    terminate() {
      host?.dispose();
    },
  };
  host = createSimHost({
    post: (m: FromWorker) => worker.onmessage?.({ data: m }),
    now: () => clock.t,
    data: DATA,
  });
  return {
    worker,
    host: () => host as SimHost,
    clock,
    sent,
    pump(ms) {
      for (let d = 0; d < ms; d += 4) {
        clock.t += 4;
        host?.pump();
      }
    },
  };
}

const g = globalThis as { crossOriginIsolated?: boolean };
afterEach(() => {
  delete g.crossOriginIsolated;
});

describe.each(['transfer', 'sab'] as const)('SimClient (%s)', (mode) => {
  const setup = async (paused = false) => {
    if (mode === 'sab') g.crossOriginIsolated = true;
    const lb = loopback();
    const client: SimClient = createSimClient({
      createWorker: () => lb.worker,
      now: () => lb.clock.t,
    });
    const ready = await client.start({
      seed: SEED,
      config: buildScenario('demo100', SEED),
      mode,
      paused,
    });
    return { lb, client, ready };
  };

  it('start resolves with ReadyInfo and the effective mode; a tick-0 snapshot is readable', async () => {
    const { client, ready } = await setup();
    expect(ready.mode).toBe(mode);
    expect(ready.capacity).toBe(1024);
    expect(ready.dataVersion).toBe(DATA.dataVersion);
    const v = client.latest();
    expect(v?.tick).toBe(0);
    expect(v?.count).toBe(100);
    expect(v?.mapW).toBe(128);
    expect(v?.eid(0)).toBe((1 << 16) | 0);
  });

  it('sends the client data version and (sab) the shared buffer in init', async () => {
    const { lb } = await setup();
    const init = lb.sent[0] as Extract<ToWorker, { t: 'init' }>;
    expect(init.dataVersion).toBe(DATA.dataVersion);
    expect(init.mode).toBe(mode);
    expect(init.sab instanceof SharedArrayBuffer).toBe(mode === 'sab');
  });

  it('latestArrivalMs changes only when a new tick is first observed; alpha runs 0 -> 1', async () => {
    const { lb, client } = await setup();
    expect(client.latest()?.tick).toBe(0);
    const t0 = client.latestArrivalMs;
    lb.pump(20); // no tick yet (50 ms needed)
    client.latest();
    expect(client.latestArrivalMs).toBe(t0);
    lb.pump(60);
    const v = client.latest();
    expect(v?.tick).toBe(1);
    const arrival = client.latestArrivalMs;
    expect(arrival).toBeGreaterThan(t0);
    expect(client.latest()?.tick).toBe(1);
    expect(client.latestArrivalMs).toBe(arrival); // same tick: base unchanged
    const us = (v as NonNullable<typeof v>).tickIntervalUs;
    expect(us).toBe(50000);
    expect(interpAlpha(arrival, arrival, us)).toBe(0);
    expect(interpAlpha(arrival + 25, arrival, us)).toBeCloseTo(0.5, 9);
    expect(interpAlpha(arrival + 80, arrival, us)).toBe(1);
  });

  it('order -> interpolated motion: prev->pos of a moving unit, discontinuity-safe', async () => {
    const { lb, client } = await setup();
    client.send([moveCmd(0, 10, 100, 64)]);
    lb.pump(600);
    const v = client.latest() as NonNullable<ReturnType<SimClient['latest']>>;
    const out = { x: 0, y: 0 };
    let moving = 0;
    for (let s = 0; s < 10; s++) {
      interpolateSlot(v, s, 0.5, 4000, true, out);
      const px = v.posX[s] as number;
      const qx = v.prevX[s] as number;
      if (px !== qx) moving++;
      expect(out.x).toBeCloseTo((px + qx) / 2, 6);
    }
    expect(moving).toBeGreaterThan(0);
  });

  it('onTurn delivers each turn once, unsubscribe works, hashes match headless', async () => {
    const { lb, client } = await setup();
    const got: { turn: number; hash: number }[] = [];
    const off = client.onTurn((t) => got.push(t));
    client.send([moveCmd(0, 30, 90, 70)]);
    lb.pump(1000);
    off();
    const n = got.length;
    lb.pump(400);
    expect(got).toHaveLength(n);
    const { sim } = newSim();
    const expected = [sim.step([moveCmd(0, 30, 90, 70)]).hash];
    for (let t = 1; t < n; t++) expected.push(sim.step([]).hash);
    expect(got.map((t) => t.hash)).toEqual(expected);
    expect(got.map((t) => t.turn)).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it('control(pause/step/resume) and perf', async () => {
    const { lb, client } = await setup(true);
    lb.pump(500);
    expect(client.latest()?.tick).toBe(0);
    client.control('step');
    expect(client.latest()?.tick).toBe(4);
    client.control('resume');
    lb.pump(2100);
    expect(client.latest()?.tick).toBeGreaterThanOrEqual(40);
    expect(client.perf.ticksDropped).toBe(0);
    expect(client.perf.tickMsMax).toBeGreaterThanOrEqual(0);
    client.control('speed', 2);
    expect((lb.sent.at(-1) as ToWorker).t).toBe('ctl');
  });

  it('keeps reading consistent snapshots under continuous ticking (view stable until next latest)', async () => {
    const { lb, client } = await setup();
    client.send([moveCmd(0, 50, 100, 64)]);
    for (let i = 0; i < 100; i++) {
      lb.pump(16);
      const v = client.latest();
      if (v === null) continue;
      const tick = v.tick;
      const x = v.posX[0];
      lb.pump(8); // worker keeps publishing meanwhile
      expect(v.tick).toBe(tick);
      expect(v.posX[0]).toBe(x);
    }
  });

  it('dispose stops the worker; start twice and an init error reject', async () => {
    const { lb, client } = await setup();
    await expect(client.start({ seed: 1, config: buildScenario('demo100', 1) })).rejects.toThrow();
    client.dispose();
    expect(lb.sent.at(-1)).toEqual({ t: 'stop' });
    expect(client.latest()).toBeNull();
    const lb2 = loopback();
    const bad = createSimClient({ createWorker: () => lb2.worker });
    const cfg = buildScenario('demo100', SEED);
    await expect(bad.start({ seed: SEED, config: { ...cfg, maxPlayers: 99 } })).rejects.toThrow(
      /maxPlayers/,
    );
  });
});

describe('SimClient mode selection', () => {
  it('uses transfer when not cross-origin isolated, even if sab is requested', async () => {
    const lb = loopback();
    const client = createSimClient({ createWorker: () => lb.worker });
    const ready = await client.start({
      seed: SEED,
      config: buildScenario('demo100', SEED),
      mode: 'sab',
    });
    expect(ready.mode).toBe('transfer');
    expect((lb.sent[0] as { sab?: unknown }).sab).toBeUndefined();
  });
  it('auto picks sab only when isolated', async () => {
    g.crossOriginIsolated = true;
    const lb = loopback();
    const client = createSimClient({ createWorker: () => lb.worker });
    expect((await client.start({ seed: SEED, config: buildScenario('demo100', SEED) })).mode).toBe(
      'sab',
    );
  });
  it('transfer mode recycles buffers back to the worker', async () => {
    const lb = loopback();
    const client = createSimClient({ createWorker: () => lb.worker, now: () => lb.clock.t });
    await client.start({ seed: SEED, config: buildScenario('demo100', SEED), mode: 'transfer' });
    for (let i = 0; i < 40; i++) {
      lb.pump(52);
      client.latest();
    }
    expect(lb.sent.filter((m) => m.t === 'recycle').length).toBeGreaterThan(30);
    expect(client.perf.snapsSkipped).toBe(0);
  });
});
