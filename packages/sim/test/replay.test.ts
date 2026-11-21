import { describe, expect, it } from 'vitest';
import {
  REPLAY_FORMAT_VERSION,
  serializeReplay,
  simDataHash,
  validateReplay,
  type Command,
  type Replay,
} from '@reinos/shared';
import { createSim, createStubMovement, runReplay } from '../src/index';
import { TEST_DATA, eidOf, makeConfig, moveCmd, spawnAt, stopCmd } from './helpers/fixtures';

const opts = { movement: createStubMovement };
const TURNS = 60;
const config = () =>
  makeConfig({
    width: 32,
    height: 32,
    spawns: [spawnAt('colono', 0, 1, 1), spawnAt('recluta', 1, 2, 2), spawnAt('jinete', 0, 3, 3)],
  });
const cmdsByTurn = new Map<number, Command[]>([
  [0, [moveCmd(0, 0, [eidOf(0), eidOf(2)], 20500, 20500), moveCmd(0, 1, [eidOf(1)], 3500, 25500)]],
  [10, [moveCmd(10, 0, [eidOf(0)], 5500, 5500)]],
  [30, [stopCmd(30, 1, [eidOf(1)])]],
]);

/** Records a replay the way a recorder would: runs the sim and stores hashFull + checkpoints. */
function record(every = 10): Replay {
  const cfg = config();
  const sim = createSim(99, 'test-1', cfg, TEST_DATA, opts);
  const turns: Replay['turns'] = [];
  const checkpoints: [number, number][] = [];
  for (let n = 0; n < TURNS; n++) {
    const cmds = cmdsByTurn.get(n) ?? [];
    if (cmds.length > 0) turns.push({ n, cmds });
    const r = sim.step(cmds);
    if ((n + 1) % every === 0) checkpoints.push([n + 1, r.hash]);
  }
  return {
    version: REPLAY_FORMAT_VERSION,
    seed: 99,
    dataVersion: 'test-1',
    simDataHash: simDataHash(TEST_DATA),
    config: cfg,
    totalTurns: TURNS,
    turns,
    finalHash: sim.hashFull(),
    checkpoints,
  };
}

describe('runReplay', () => {
  it('re-running a recorded replay is ok with identical checkpoints', () => {
    const rep = record();
    const res = runReplay(rep, TEST_DATA, opts);
    expect(res.ok).toBe(true);
    expect(res.finalHash).toBe(rep.finalHash);
    expect(res.checkpoints).toEqual(rep.checkpoints);
    expect(res.firstDivergentCheckpoint).toBeNull();
  });
  it('survives serialize -> JSON.parse -> validate before running', () => {
    const rep = record();
    const back = validateReplay(JSON.parse(serializeReplay(rep)));
    expect(back).toEqual(rep);
    expect(runReplay(back, TEST_DATA, opts).ok).toBe(true);
  });
  it('altering a command gives ok=false and names the first divergent checkpoint', () => {
    const rep = record();
    const bad = structuredClone(rep);
    // the move at turn 30 -> stop becomes a move: the divergence starts at turn 30
    bad.turns[2]!.cmds[0] = moveCmd(30, 1, [eidOf(1)], 25500, 3500);
    const res = runReplay(bad, TEST_DATA, opts);
    expect(res.ok).toBe(false);
    expect(res.firstDivergentCheckpoint).toBe(40);
    expect(res.finalHash).not.toBe(rep.finalHash);
    // the checkpoints before the change still match
    expect(res.checkpoints.slice(0, 3)).toEqual(rep.checkpoints!.slice(0, 3));
  });
  it('a tampered finalHash alone is detected without a divergent checkpoint', () => {
    const rep = record();
    const res = runReplay({ ...rep, finalHash: rep.finalHash ^ 1 }, TEST_DATA, opts);
    expect(res.ok).toBe(false);
    expect(res.firstDivergentCheckpoint).toBeNull();
  });
  it('records checkpoints every K turns when the replay has none', () => {
    const rep = record();
    delete rep.checkpoints;
    const res = runReplay(rep, TEST_DATA, { ...opts, checkpointEvery: 20 });
    expect(res.ok).toBe(true);
    expect(res.checkpoints.map((c) => c[0])).toEqual([20, 40, 60]);
  });
  it('an unreachable checkpoint makes the run not ok', () => {
    const rep = record();
    rep.checkpoints!.push([TURNS + 5, 1]);
    expect(runReplay(rep, TEST_DATA, opts).ok).toBe(false);
  });
  it('rejects a dataVersion that does not match the data', () => {
    expect(() => runReplay({ ...record(), dataVersion: '9.9.9' }, TEST_DATA, opts)).toThrow(
      /dataVersion/,
    );
  });
  it('rejects data whose content differs from the recording even with the same dataVersion', () => {
    const rep = record();
    const edited = { ...TEST_DATA, movement: { ...TEST_DATA.movement, separationPermille: 701 } };
    expect(() => runReplay(rep, edited, opts)).toThrow(/simDataHash mismatch/);
    expect(() => runReplay({ ...rep, simDataHash: rep.simDataHash ^ 1 }, TEST_DATA, opts)).toThrow(
      /simDataHash mismatch/,
    );
  });
  it('turns without commands are omitted and the run is unaffected by that', () => {
    const rep = record();
    expect(rep.turns.map((t) => t.n)).toEqual([0, 10, 30]);
    expect(rep.totalTurns).toBe(TURNS);
  });
});
