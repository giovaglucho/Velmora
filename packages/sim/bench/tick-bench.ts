// Reproducible tick-time benchmark for the movement stack (plan K2: p95 <= 3 ms with 400 units
// moving). performance.now() is allowed here: this is not packages/sim/src.
//
//   pnpm --filter @reinos/sim bench                      # defaults: 400 units, 200x200 map
//   pnpm --filter @reinos/sim bench -- --units 1000 --ticks 3000 --side 300 --seed 7
//
// Scenario (fully seeded): obstacle map, units spawned on free tiles, groups re-ordered to random
// free tiles every REISSUE ticks so (almost) every unit keeps walking. The SimData is the same
// hand-made integer table the tests use (tuning equals packages/data/json/game.json "movement").
import { performance } from 'node:perf_hooks';
import { createPrng, type Command, type SimConfig } from '@reinos/shared';
import { createSim } from '../src/index';
import { TEST_DATA, moveCmd, rleFromBlocked } from '../test/helpers/fixtures';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}
const UNITS = arg('units', 400);
const TICKS = arg('ticks', 2000);
const WARMUP = arg('warmup', 200);
const SIDE = arg('side', 200);
const SEED = arg('seed', 1);
const GROUP = arg('group', 50);
const REISSUE = arg('reissue', 400);

const rng = createPrng(SEED);
const blocked = new Set<number>();
for (let k = 0; k < Math.trunc((SIDE * SIDE) / 90); k++) {
  const bx = rng.nextInt(SIDE - 6);
  const by = rng.nextInt(SIDE - 6);
  const bw = 1 + rng.nextInt(6);
  const bh = 1 + rng.nextInt(6);
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) blocked.add(y * SIDE + x);
}
const freeTile = (): number => {
  for (;;) {
    const i = rng.nextInt(SIDE * SIDE);
    if (!blocked.has(i)) return i;
  }
};
const config: SimConfig = {
  maxPlayers: 1,
  maxEntities: Math.max(UNITS + 16, 64),
  map: { width: SIDE, height: SIDE, blockedRle: rleFromBlocked(SIDE, SIDE, blocked) },
  spawns: Array.from({ length: UNITS }, () => {
    const t = freeTile();
    return {
      unit: TEST_DATA.unitIds[rng.nextInt(TEST_DATA.unitIds.length)] as string,
      owner: 0,
      x: (t % SIDE) * 1000 + 500,
      y: Math.trunc(t / SIDE) * 1000 + 500,
    };
  }),
};
const sim = createSim(SEED, 'test-1', config, TEST_DATA);
const eid = (slot: number): number => ((1 << 16) | slot) >>> 0;
const groups = Math.ceil(UNITS / GROUP);

function orders(turn: number): Command[] {
  const cmds: Command[] = [];
  for (let g = 0; g < groups; g++) {
    // each group is re-ordered every REISSUE ticks, staggered (offsets are turn-aligned)
    const offset = Math.trunc((g * REISSUE) / groups / 4) * 4;
    if (sim.tick % REISSUE !== offset) continue;
    const ids: number[] = [];
    for (let s = g * GROUP; s < Math.min(UNITS, (g + 1) * GROUP); s++) ids.push(eid(s));
    const t = freeTile();
    cmds.push(moveCmd(turn, 0, ids, (t % SIDE) * 1000 + 500, Math.trunc(t / SIDE) * 1000 + 500));
  }
  return cmds;
}

const samples: number[] = [];
let movingSum = 0;
for (let k = 0; k < WARMUP + TICKS; k++) {
  const cmds = sim.tick % 4 === 0 ? (k === 0 ? initial() : orders(sim.turn)) : undefined;
  const t0 = performance.now();
  sim.stepTick(cmds);
  const dt = performance.now() - t0;
  if (k >= WARMUP) {
    samples.push(dt);
    let moving = 0;
    for (let i = 0; i < UNITS; i++) if (sim.world.orderKind[i] === 1) moving++;
    movingSum += moving;
  }
}
function initial(): Command[] {
  const cmds: Command[] = [];
  for (let g = 0; g < groups; g++) {
    const ids: number[] = [];
    for (let s = g * GROUP; s < Math.min(UNITS, (g + 1) * GROUP); s++) ids.push(eid(s));
    const t = freeTile();
    cmds.push(
      moveCmd(sim.turn, 0, ids, (t % SIDE) * 1000 + 500, Math.trunc(t / SIDE) * 1000 + 500),
    );
  }
  return cmds;
}

const sorted = samples.slice().sort((a, b) => a - b);
const pct = (p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.trunc((sorted.length * p) / 100))] as number;
const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
const row = {
  units: UNITS,
  map: SIDE + 'x' + SIDE,
  seed: SEED,
  measuredTicks: samples.length,
  avgMovingUnits: Math.round(movingSum / samples.length),
  meanMs: +mean.toFixed(3),
  p50Ms: +pct(50).toFixed(3),
  p95Ms: +pct(95).toFixed(3),
  p99Ms: +pct(99).toFixed(3),
  maxMs: +sorted[sorted.length - 1]!.toFixed(3),
  node: process.version,
};
console.log(JSON.stringify(row, null, 2));
console.log(row.p95Ms <= 3 ? 'OK: p95 <= 3 ms' : 'OVER BUDGET: p95 > 3 ms');
