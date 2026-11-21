import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSimData, generateScenario, scenarioOptions, hex32 } from '../src/index';
import { runCli, tmpDir, writeReplay, writeText } from './helpers';

const data = loadSimData();
const t = tmpDir();
afterAll(t.cleanup);
const sc = generateScenario(scenarioOptions('small', 7), data);
let good = '';
beforeAll(() => {
  good = writeReplay(t.dir, 'good.json', sc.replay);
});

describe('headless run', () => {
  it('valid replay: exit 0 and prints the finalHash and checkpoints', () => {
    const r = runCli(['run', good]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('finalHash: ' + hex32(sc.replay.finalHash));
    expect(r.out).toContain('result: OK');
    for (const [turn, h] of sc.replay.checkpoints ?? [])
      expect(r.out).toContain('checkpoint ' + turn + ': ' + hex32(h));
  });

  it('tampered finalHash: exit 1', () => {
    const p = writeReplay(t.dir, 'bad-final.json', {
      ...sc.replay,
      finalHash: (sc.replay.finalHash ^ 1) >>> 0,
    });
    const r = runCli(['run', p]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('result: MISMATCH');
  });

  it('tampered checkpoint: exit 1 naming the first divergent checkpoint', () => {
    const cps = (sc.replay.checkpoints ?? []).map((c) => [c[0], c[1]] as [number, number]);
    const idx = 1;
    (cps[idx] as [number, number])[1] = ((cps[idx] as [number, number])[1] ^ 0x10) >>> 0;
    const p = writeReplay(t.dir, 'bad-cp.json', { ...sc.replay, checkpoints: cps });
    const r = runCli(['run', p]);
    expect(r.code).toBe(1);
    expect(r.out).toContain(
      'first divergent checkpoint: turn ' + (cps[idx] as [number, number])[0],
    );
  });

  it('corrupt JSON: exit 2', () => {
    const r = runCli(['run', writeText(t.dir, 'corrupt.json', '{"version": 1, ')]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('invalid JSON');
  });

  it('non-integer values: exit 2 naming the field', () => {
    const obj = JSON.parse(JSON.stringify(sc.replay)) as { totalTurns: number };
    obj.totalTurns = 12.5;
    const r = runCli(['run', writeText(t.dir, 'float.json', JSON.stringify(obj))]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('replay.totalTurns');
  });

  it('missing file: exit 2', () => {
    expect(runCli(['run', t.dir + '/nope.json']).code).toBe(2);
  });

  it('incompatible dataVersion: clear message and exit 2', () => {
    const p = writeReplay(t.dir, 'old-data.json', { ...sc.replay, dataVersion: '0.0.1-old' });
    const r = runCli(['run', p]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('dataVersion mismatch');
    expect(r.err).toContain('0.0.1-old');
  });

  it('no arguments / unknown command: exit 2', () => {
    expect(runCli([]).code).toBe(2);
    expect(runCli(['frobnicate']).code).toBe(2);
    expect(runCli(['run']).code).toBe(2);
  });

  it('output is byte-stable across two runs', () => {
    expect(runCli(['run', good])).toEqual(runCli(['run', good]));
  });
});

describe('headless hashes / gen-scenario', () => {
  it('hashes prints hashes without comparing (exit 0 even if tampered)', () => {
    const p = writeReplay(t.dir, 'h.json', { ...sc.replay, finalHash: 0 });
    const r = runCli(['hashes', p]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('finalHash: ' + hex32(sc.replay.finalHash));
  });

  it('gen-scenario writes a replay that `run` accepts', () => {
    const out = t.dir + '/gen.json';
    const g = runCli(['gen-scenario', '--scenario', 'small', '--seed', '7', '--out', out]);
    expect(g.code).toBe(0);
    expect(g.out).toContain('finalHash: ' + hex32(sc.replay.finalHash));
    expect(runCli(['run', out]).code).toBe(0);
  });
});
