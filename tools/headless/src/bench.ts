// Tick-time benchmark (plan D3). performance.now() is allowed here: this is not packages/sim.
import os from 'node:os';
import { TURN_TICKS, type Command, type SimData } from '@reinos/shared';
import { ORDER_NONE, createSim, type SimOptions } from '@reinos/sim';
import { buildScenarioWorld, moveCommand, randomFreeTile, scenarioOptions } from './scenario';

export interface BenchOptions {
  units: number;
  /** Measured turns (after warmup). */
  turns: number;
  /** Warmup turns, discarded (plan: 200 ticks = 50 turns). */
  warmupTurns: number;
  seed: number;
  /** Each command group is re-ordered every this many turns, so orders stay active. */
  reissueEvery: number;
  mapSide: number;
  groupMax: number;
}

export const DEFAULT_BENCH: BenchOptions = {
  units: 400,
  turns: 500,
  warmupTurns: 50,
  seed: 1,
  reissueEvery: 100,
  mapSide: 200,
  groupMax: 100,
};

export interface BenchRow {
  units: number;
  turns: number;
  ticks: number;
  /** Per-tick figures in ms (per-turn time / TURN_TICKS; includes commands and hash). */
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Mean share of units with an active order during the measured turns, in percent. */
  activePct: number;
}

export interface BenchEnv {
  node: string;
  cpu: string;
  cores: number;
  platform: string;
}

export function benchEnv(): BenchEnv {
  const cpus = os.cpus();
  return {
    node: process.version,
    cpu: cpus[0]?.model ?? 'unknown',
    cores: cpus.length,
    platform: os.platform() + ' ' + os.arch(),
  };
}

export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx] as number;
}

export function runBench(o: BenchOptions, data: SimData, simOpts?: SimOptions): BenchRow {
  const so = scenarioOptions('thousand', o.seed);
  so.units = o.units;
  so.mapSide = o.mapSide;
  const w = buildScenarioWorld(so, data);
  const sim = createSim(o.seed, data.dataVersion, w.config, data, simOpts);
  // Fixed command groups: (player, slice), staggered so reissues spread across turns.
  const groups: { p: number; ids: number[]; phase: number }[] = [];
  for (let p = 0; p < 2; p++) {
    const ids = w.eids[p] as number[];
    for (let a = 0; a < ids.length; a += o.groupMax)
      groups.push({ p, ids: ids.slice(a, a + o.groupMax), phase: groups.length });
  }
  const perTick: number[] = [];
  let activeSum = 0;
  const total = o.warmupTurns + o.turns;
  for (let n = 0; n < total; n++) {
    const cmds: Command[] = [];
    for (const g of groups) {
      if (n === 0 || (n + g.phase) % o.reissueEvery === 0) {
        const t = randomFreeTile(w.rng, w.map, o.mapSide, 0, o.mapSide);
        cmds.push(moveCommand(n, g.p, g.ids, t.tx, t.ty));
      }
    }
    const t0 = performance.now();
    sim.step(cmds);
    const dt = performance.now() - t0;
    if (n >= o.warmupTurns) {
      perTick.push(dt / TURN_TICKS);
      let active = 0;
      for (let i = 0; i < sim.world.highWater; i++)
        if (sim.world.alive[i] === 1 && sim.world.orderKind[i] !== ORDER_NONE) active++;
      activeSum += active;
    }
  }
  const sorted = perTick.slice().sort((a, b) => a - b);
  let sum = 0;
  for (const v of perTick) sum += v;
  const n = perTick.length;
  return {
    units: w.config.spawns.length,
    turns: n,
    ticks: n * TURN_TICKS,
    meanMs: n === 0 ? 0 : sum / n,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted[sorted.length - 1] ?? 0,
    activePct:
      n === 0 || w.config.spawns.length === 0
        ? 0
        : (activeSum * 100) / (n * w.config.spawns.length),
  };
}

/** K2: 400 units, p95 and mean per tick <= 3 ms. */
export const K2_LIMIT_MS = 3;

const f = (v: number): string => v.toFixed(3);

export function benchMarkdown(
  rows: readonly BenchRow[],
  env: BenchEnv,
  command: string,
  o: BenchOptions,
): string {
  const lines = [
    '# Benchmark de tick (Fase 1)',
    '',
    'Comando: `' + command + '`',
    '',
    '- Máquina: ' + env.cpu + ' (' + env.cores + ' núcleos, ' + env.platform + ')',
    '- Node: ' + env.node,
    '- Calentamiento: ' +
      o.warmupTurns * TURN_TICKS +
      ' ticks descartados; medición: ' +
      o.turns +
      ' turnos (' +
      o.turns * TURN_TICKS +
      ' ticks)',
    '- Tiempo por tick = tiempo del turno (comandos + 4 ticks + hash) / 4; mapa ' +
      o.mapSide +
      'x' +
      o.mapSide +
      ' con obstáculos, ordenes de movimiento reemitidas cada ' +
      o.reissueEvery +
      ' turnos.',
    '',
    '| Unidades | media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | máx (ms) | con orden activa (%) |',
    '| -------: | ---------: | -------: | -------: | -------: | -------: | -------------------: |',
  ];
  for (const r of rows)
    lines.push(
      '| ' +
        r.units +
        ' | ' +
        f(r.meanMs) +
        ' | ' +
        f(r.p50Ms) +
        ' | ' +
        f(r.p95Ms) +
        ' | ' +
        f(r.p99Ms) +
        ' | ' +
        f(r.maxMs) +
        ' | ' +
        r.activePct.toFixed(1) +
        ' |',
    );
  const k2 = rows.find((r) => r.units === 400);
  lines.push('');
  if (k2 !== undefined)
    lines.push(
      'K2 (400 unidades, media y p95 <= ' +
        K2_LIMIT_MS +
        ' ms/tick): ' +
        (k2.meanMs <= K2_LIMIT_MS && k2.p95Ms <= K2_LIMIT_MS ? 'CUMPLE' : 'NO CUMPLE') +
        '.',
    );
  lines.push('');
  return lines.join('\n');
}
