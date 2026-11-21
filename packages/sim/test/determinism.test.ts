import { describe, expect, it } from 'vitest';

// Fase 0: placeholder real. La Fase 1 lo ampliara con el hash del estado de la sim por tick.
const SEED = 0xc0ffee;
const COUNT = 1000;
const EXPECTED_HASH = 0xcb6be2e0; // FNV-1a de 1000 u32 de xoshiro128** (semilla 0xc0ffee); verificado contra implementacion de referencia independiente (Python)

function sequence(seed: number): number[] {
  const rng = createPrng(seed);
  const out: number[] = [];
  for (let i = 0; i < COUNT; i++) out.push(rng.nextU32());
  return out;
}

describe('determinismo (placeholder Fase 0)', () => {
  it('la secuencia xoshiro128** con semilla fija produce el hash esperado', () => {
    expect(hashInts(sequence(SEED))).toBe(EXPECTED_HASH);
  });
  it('misma semilla, mismo hash; otra semilla, otro hash', () => {
    expect(hashInts(sequence(SEED))).toBe(hashInts(sequence(SEED)));
    expect(hashInts(sequence(SEED + 1))).not.toBe(hashInts(sequence(SEED)));
  });
});

// ---- Fase 1: escenario de 200 unidades x 1000 ticks con hash dorado ----------------------------
import {
  TURN_TICKS,
  createPrng,
  hashInts,
  type Command,
  type SimConfig,
  type SpawnSpec,
} from '@reinos/shared';
import { createSim, createStubMovement, type MovementFactory } from '../src/index';
import { TEST_DATA, moveCmd, rleFromBlocked, stopCmd } from './helpers/fixtures';

const SCENARIO_UNITS = 200;
const SCENARIO_TICKS = 1000;
const SCENARIO_TURNS = SCENARIO_TICKS / TURN_TICKS;
// Golden values: computed twice (two independent runs, see the test) and pinned. A change here
// means replay compatibility changed: bump REPLAY_FORMAT_VERSION and re-pin (ADR-005).
// REAL movement (grid + hierarchical A* + steering, createSim default): pinned in Fase 1 / C5.
// Verified in two separate Node processes (PRINT_GOLDEN=1) plus the in-test double run; a full
// independent reference (A* + steering) is not viable, so cross-process equality is the check.
const GOLDEN_FINAL_HASH = 808018988;
const GOLDEN_TURN_DIGEST = 2270793453;
// Straight-line stub (injected): the previous golden, kept to prove the injection path still works.
const STUB_FINAL_HASH = 729929481;
const STUB_TURN_DIGEST = 3546440723;

function scenario(scenarioSeed: number): { config: SimConfig; cmds: Map<number, Command[]> } {
  const rng = createPrng(scenarioSeed); // scenario generator PRNG: separate from the sim's
  const W = 64;
  const H = 64;
  const blocked = new Set<number>();
  for (let k = 0; k < 40; k++) {
    const bx = rng.nextInt(W - 4);
    const by = rng.nextInt(H - 4);
    for (let y = by; y < by + 1 + rng.nextInt(4); y++)
      for (let x = bx; x < bx + 1 + rng.nextInt(4); x++) blocked.add(y * W + x);
  }
  const free: number[] = [];
  for (let i = 0; i < W * H; i++) if (!blocked.has(i)) free.push(i);
  const units = TEST_DATA.unitIds;
  const spawns: SpawnSpec[] = [];
  for (let n = 0; n < SCENARIO_UNITS; n++) {
    const cell = free[rng.nextInt(free.length)] as number;
    spawns.push({
      unit: units[rng.nextInt(units.length)] as string,
      owner: n % 2,
      x: (cell % W) * 1000 + 500,
      y: Math.trunc(cell / W) * 1000 + 500,
    });
  }
  const cmds = new Map<number, Command[]>();
  for (let t = 0; t < SCENARIO_TURNS; t++) {
    if (rng.nextInt(3) !== 0) continue;
    const list: Command[] = [];
    for (let c = 1 + rng.nextInt(3); c > 0; c--) {
      const player = rng.nextInt(2);
      const ids: number[] = [];
      for (let k = 1 + rng.nextInt(30); k > 0; k--) {
        const slot = player + 2 * rng.nextInt(SCENARIO_UNITS / 2);
        ids.push(((1 << 16) | slot) >>> 0);
      }
      list.push(
        rng.nextInt(6) === 0
          ? stopCmd(t, player, ids)
          : moveCmd(t, player, ids, rng.nextInt(W * 1000), rng.nextInt(H * 1000)),
      );
    }
    cmds.set(t, list);
  }
  return {
    config: {
      maxPlayers: 2,
      maxEntities: 256,
      map: { width: W, height: H, blockedRle: rleFromBlocked(W, H, blocked) },
      spawns,
    },
    cmds,
  };
}

function runScenario(
  scenarioSeed: number,
  simSeed: number,
  movement?: MovementFactory,
): { finalHash: number; digest: number } {
  const { config, cmds } = scenario(scenarioSeed);
  const sim = createSim(simSeed, 'test-1', config, TEST_DATA, movement ? { movement } : undefined);
  const perTurn: number[] = [];
  for (let t = 0; t < SCENARIO_TURNS; t++) perTurn.push(sim.step(cmds.get(t) ?? []).hash);
  expect(sim.tick).toBe(SCENARIO_TICKS);
  return { finalHash: sim.hashFull(), digest: hashInts(perTurn) };
}

describe('determinismo Fase 1: 200 unidades x 1000 ticks', () => {
  it('coincide con el hash dorado del movimiento real (dos corridas independientes)', () => {
    const a = runScenario(0xa11ce, 42);
    const b = runScenario(0xa11ce, 42);
    expect(b).toEqual(a);
    if (process.env.PRINT_GOLDEN) console.log('GOLDEN', a.finalHash, a.digest);
    expect(a.finalHash).toBe(GOLDEN_FINAL_HASH);
    expect(a.digest).toBe(GOLDEN_TURN_DIGEST);
  });
  it('el stub inyectado conserva su hash dorado anterior', () => {
    const a = runScenario(0xa11ce, 42, createStubMovement);
    expect(a.finalHash).toBe(STUB_FINAL_HASH);
    expect(a.digest).toBe(STUB_TURN_DIGEST);
  });
  it('es sensible a la semilla de la partida y a la del escenario', () => {
    const base = runScenario(0xa11ce, 42);
    expect(runScenario(0xa11ce, 43).finalHash).not.toBe(base.finalHash);
    expect(runScenario(0xa11cf, 42).finalHash).not.toBe(base.finalHash);
  });
  it('el escenario ejerce movimiento real', () => {
    const { config, cmds } = scenario(0xa11ce);
    const sim = createSim(42, 'test-1', config, TEST_DATA);
    const start = Array.from(sim.world.posX);
    for (let t = 0; t < SCENARIO_TURNS; t++) sim.step(cmds.get(t) ?? []);
    let moved = 0;
    for (let i = 0; i < SCENARIO_UNITS; i++) if (sim.world.posX[i] !== start[i]) moved++;
    expect(moved).toBeGreaterThan(SCENARIO_UNITS / 2);
  });
});
