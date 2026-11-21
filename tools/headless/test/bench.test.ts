import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCH, benchMarkdown, benchEnv, loadSimData, runBench } from '../src/index';
import { runCli } from './helpers';

const data = loadSimData();

describe('bench', () => {
  const o = { ...DEFAULT_BENCH, units: 40, turns: 20, warmupTurns: 5, mapSide: 64, groupMax: 20 };
  it('reports ordered statistics and active orders', () => {
    const r = runBench(o, data);
    expect(r.units).toBe(40);
    expect(r.ticks).toBe(80);
    expect(r.p50Ms).toBeLessThanOrEqual(r.p95Ms);
    expect(r.p95Ms).toBeLessThanOrEqual(r.p99Ms);
    expect(r.p99Ms).toBeLessThanOrEqual(r.maxMs);
    expect(r.activePct).toBeGreaterThan(50);
  });
  it('renders a markdown table with the environment', () => {
    const md = benchMarkdown([runBench(o, data)], benchEnv(), 'cmd', o);
    expect(md).toContain('| Unidades |');
    expect(md).toContain('Node:');
  });
  it('CLI bench prints JSON', () => {
    const r = runCli(['bench', '--units', '20', '--turns', '8', '--warmup', '2', '--json']);
    expect(r.code).toBe(0);
    expect((JSON.parse(r.out) as { rows: unknown[] }).rows).toHaveLength(1);
  });
});
