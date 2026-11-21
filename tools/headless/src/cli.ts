// headless CLI. Exit codes of `run`: 0 hashes match, 1 mismatch, 2 format/usage error.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TURN_TICKS, type Replay, type SimData } from '@reinos/shared';
import { runReplay } from '@reinos/sim';
import {
  ReplayFormatError,
  hex32,
  loadSimData,
  readReplayFile,
  resolveUserPath,
  writeReplayFile,
} from './replay-io';
import { SCENARIOS, generateScenario, scenarioOptions, type ScenarioName } from './scenario';
import { DEFAULT_BENCH, benchEnv, benchMarkdown, runBench, type BenchOptions } from './bench';
import { GOLDEN_PATH } from './golden-path';
import { compareGolden, computeGolden, goldenScenario, readGolden, writeGolden } from './golden';

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

const USAGE = [
  'usage: headless <command> [options]',
  '  run <replay.json> [--every K] [--time]   run a replay; exit 0 match, 1 mismatch, 2 bad file',
  '  hashes <replay.json> [--every K]         print finalHash and checkpoints (no comparison)',
  '  gen-scenario [--scenario thousand|small] [--seed N] [--out file.json]',
  '  bench [--units 400,1000] [--turns 500] [--warmup 50] [--seed N] [--md file] [--json]',
  '  golden update|check                      regenerate / verify tools/headless/golden.json',
].join('\n');

class UsageError extends Error {}

interface Args {
  pos: string[];
  flags: Map<string, string>;
}

function parseArgs(argv: readonly string[], boolFlags: readonly string[]): Args {
  const pos: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--') continue;
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (boolFlags.includes(k)) flags.set(k, '1');
      else {
        const v = argv[++i];
        if (v === undefined) throw new UsageError('missing value for --' + k);
        flags.set(k, v);
      }
    } else pos.push(a);
  }
  return { pos, flags };
}

function intFlag(a: Args, k: string, def: number): number {
  const v = a.flags.get(k);
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0)
    throw new UsageError('--' + k + ' must be a non-negative integer');
  return n;
}

function printResult(
  io: Io,
  replay: Replay,
  r: ReturnType<typeof runReplay>,
  compare: boolean,
): void {
  io.out('dataVersion: ' + replay.dataVersion + '  seed: ' + replay.seed);
  io.out('turns: ' + replay.totalTurns + ' (' + replay.totalTurns * TURN_TICKS + ' ticks)');
  for (const [t, h] of r.checkpoints) io.out('checkpoint ' + t + ': ' + hex32(h));
  io.out(
    'finalHash: ' +
      hex32(r.finalHash) +
      (compare ? ' (expected ' + hex32(replay.finalHash) + ')' : ''),
  );
}

function cmdRun(args: Args, io: Io, data: SimData, compare: boolean): number {
  const file = args.pos[0];
  if (file === undefined) throw new UsageError('missing <replay.json>');
  const replay = readReplayFile(resolveUserPath(file));
  if (replay.dataVersion !== data.dataVersion)
    throw new ReplayFormatError(
      'dataVersion mismatch: replay "' +
        replay.dataVersion +
        '" vs build "' +
        data.dataVersion +
        '"; regenerate the replay or use a matching build',
    );
  const every = intFlag(args, 'every', 0);
  const t0 = performance.now();
  const r = runReplay(replay, data, every > 0 ? { checkpointEvery: every } : undefined);
  const ms = performance.now() - t0;
  printResult(io, replay, r, compare);
  if (args.flags.has('time')) io.err('elapsed: ' + ms.toFixed(0) + ' ms');
  if (!compare) return 0;
  if (r.ok) {
    io.out('result: OK');
    return 0;
  }
  io.out(
    'result: MISMATCH' +
      (r.firstDivergentCheckpoint !== null
        ? ' (first divergent checkpoint: turn ' + r.firstDivergentCheckpoint + ')'
        : ' (all checkpoints match; finalHash differs)'),
  );
  return 1;
}

function scenarioName(v: string | undefined): ScenarioName {
  const n = v ?? 'thousand';
  if (!Object.hasOwn(SCENARIOS, n)) throw new UsageError('unknown scenario "' + n + '"');
  return n as ScenarioName;
}

function cmdGen(args: Args, io: Io, data: SimData): number {
  const name = scenarioName(args.flags.get('scenario'));
  const seed = intFlag(args, 'seed', 1);
  const sc = generateScenario(scenarioOptions(name, seed), data);
  const out = resolveUserPath(args.flags.get('out') ?? name + '-' + seed + '.replay.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeReplayFile(out, sc.replay);
  const s = sc.stats;
  io.out('scenario: ' + name + '  seed: ' + seed + '  -> ' + out);
  io.out(
    'units: ' +
      s.units +
      '  commands: ' +
      s.commands +
      ' (move ' +
      s.moveCommands +
      ', stop ' +
      s.stopCommands +
      ', unreachable ' +
      s.pocketCommands +
      ')',
  );
  io.out(
    'blocked: ' +
      (s.blockedPermille / 10).toFixed(1) +
      '%  unitsMoved: ' +
      s.unitsMoved +
      '/' +
      s.units,
  );
  io.out('finalHash: ' + hex32(sc.replay.finalHash));
  io.err('generated in ' + sc.elapsedMs.toFixed(0) + ' ms');
  return 0;
}

function cmdBench(args: Args, io: Io, data: SimData): number {
  const unitsList = (args.flags.get('units') ?? '400,1000').split(',').map(Number);
  if (unitsList.some((n) => !Number.isInteger(n) || n < 2)) throw new UsageError('bad --units');
  const base: BenchOptions = {
    ...DEFAULT_BENCH,
    turns: intFlag(args, 'turns', DEFAULT_BENCH.turns),
    warmupTurns: intFlag(args, 'warmup', DEFAULT_BENCH.warmupTurns),
    seed: intFlag(args, 'seed', DEFAULT_BENCH.seed),
  };
  const rows = unitsList.map((u) => runBench({ ...base, units: u }, data));
  const env = benchEnv();
  const cmd =
    'pnpm --filter @reinos/headless run bench -- --units ' +
    unitsList.join(',') +
    ' --turns ' +
    base.turns;
  const md = benchMarkdown(rows, env, cmd, base);
  if (args.flags.has('json')) io.out(JSON.stringify({ env, rows }, null, 2));
  else io.out(md);
  const mdPath = args.flags.get('md');
  if (mdPath !== undefined) {
    const p = resolveUserPath(mdPath);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, md);
  }
  return 0;
}

function cmdGolden(args: Args, io: Io, data: SimData): number {
  const sub = args.pos[0];
  const g = readGolden(GOLDEN_PATH);
  if (sub === 'update') {
    const next = computeGolden(g, data);
    writeGolden(next, GOLDEN_PATH);
    io.out('golden updated: ' + GOLDEN_PATH);
    io.out('finalHash: ' + hex32(next.finalHash as number) + '  dataVersion: ' + next.dataVersion);
    return 0;
  }
  if (sub === 'check') {
    const replay = goldenScenario(g, data);
    const r = runReplay(replay, data);
    const v = compareGolden(g, replay, r);
    io.out(
      'golden: ' +
        v.kind +
        ('reason' in v ? ' - ' + v.reason : '') +
        '  finalHash ' +
        hex32(r.finalHash),
    );
    return v.kind === 'match' ? 0 : 1;
  }
  throw new UsageError('golden update|check');
}

/** Entry point; returns the process exit code. */
export function main(argv: readonly string[], io: Io, data?: SimData): number {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === undefined || cmd === '--help' || cmd === 'help') {
      io.out(USAGE);
      return cmd === undefined ? 2 : 0;
    }
    const args = parseArgs(rest, ['time', 'json']);
    const d = data ?? loadSimData();
    switch (cmd) {
      case 'run':
        return cmdRun(args, io, d, true);
      case 'hashes':
        return cmdRun(args, io, d, false);
      case 'gen-scenario':
        return cmdGen(args, io, d);
      case 'bench':
        return cmdBench(args, io, d);
      case 'golden':
        return cmdGolden(args, io, d);
      default:
        throw new UsageError('unknown command "' + cmd + '"');
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err('error: ' + e.message + '\n' + USAGE);
      return 2;
    }
    if (e instanceof ReplayFormatError) {
      io.err('error: ' + e.message);
      return 2;
    }
    throw e;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = main(process.argv.slice(2), {
    out: (l) => process.stdout.write(l + '\n'),
    err: (l) => process.stderr.write(l + '\n'),
  });
  process.exitCode = code;
}
