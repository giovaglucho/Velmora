// Replay execution (ADR-005 §9). Used by Node and by the browsers.
import { simDataHash, type Command, type Replay, type SimData } from '@reinos/shared';
import { createSim, type SimOptions } from './sim';

export interface ReplayRunOptions extends SimOptions {
  /**
   * When the replay has no checkpoints, record [completed turn, hash()] every K turns
   * (K >= 1). Ignored if the replay carries its own checkpoints.
   */
  checkpointEvery?: number;
}

export interface ReplayRunResult {
  /** sim.hashFull() after totalTurns turns. */
  finalHash: number;
  /** [completed turn, sim.hash()] computed at the replay's checkpoint turns (or every K turns). */
  checkpoints: [number, number][];
  /** finalHash and every replay checkpoint match. */
  ok: boolean;
  /** Completed-turn number of the first checkpoint that differs, or null. */
  firstDivergentCheckpoint: number | null;
}

const NO_COMMANDS: readonly Command[] = [];

export function runReplay(replay: Replay, data: SimData, opts?: ReplayRunOptions): ReplayRunResult {
  const localHash = simDataHash(data);
  if (replay.simDataHash !== localHash)
    throw new Error('simDataHash mismatch: replay ' + replay.simDataHash + ' vs data ' + localHash);
  const sim = createSim(replay.seed, replay.dataVersion, replay.config, data, opts);
  const wanted = replay.checkpoints;
  const every = opts?.checkpointEvery ?? 0;
  const out: [number, number][] = [];
  let firstBad: number | null = null;
  let ci = 0; // next replay checkpoint
  let ti = 0; // next replay turn with commands
  for (let n = 0; n < replay.totalTurns; n++) {
    let cmds = NO_COMMANDS;
    const t = replay.turns[ti];
    if (t !== undefined && t.n === n) {
      cmds = t.cmds;
      ti++;
    }
    const res = sim.step(cmds);
    const done = n + 1;
    if (wanted !== undefined) {
      const cp = wanted[ci];
      if (cp !== undefined && cp[0] === done) {
        out.push([done, res.hash]);
        if (res.hash !== cp[1] && firstBad === null) firstBad = done;
        ci++;
      }
    } else if (every > 0 && done % every === 0) out.push([done, res.hash]);
  }
  const finalHash = sim.hashFull();
  return {
    finalHash,
    checkpoints: out,
    ok:
      finalHash === replay.finalHash &&
      firstBad === null &&
      (wanted === undefined || ci === wanted.length),
    firstDivergentCheckpoint: firstBad,
  };
}
