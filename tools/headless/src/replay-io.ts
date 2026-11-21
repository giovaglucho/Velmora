// Replay file I/O for the headless tools. JSON.parse lives here (not in @reinos/shared).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateReplay, serializeReplay, type Replay, type SimData } from '@reinos/shared';
import { buildSimData, loadGameData } from '@reinos/data';

/** Thrown for unreadable/corrupt/invalid replay files (CLI exit code 2). */
export class ReplayFormatError extends Error {
  override name = 'ReplayFormatError';
}

export function parseReplayJson(text: string): Replay {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ReplayFormatError('invalid JSON: ' + (e as Error).message);
  }
  try {
    return validateReplay(raw);
  } catch (e) {
    throw new ReplayFormatError((e as Error).message);
  }
}

export function readReplayFile(file: string): Replay {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    throw new ReplayFormatError('cannot read ' + file + ': ' + (e as Error).message);
  }
  return parseReplayJson(text);
}

export function writeReplayFile(file: string, replay: Replay): void {
  writeFileSync(file, serializeReplay(replay) + '\n');
}

/** Integer SimData built from the bundled balance data (float -> fixed conversion happens in @reinos/data). */
export function loadSimData(): SimData {
  return buildSimData(loadGameData());
}

/** Resolves a user-supplied path against the directory the user ran the command from (pnpm sets INIT_CWD). */
export function resolveUserPath(p: string): string {
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

export function hex32(n: number): string {
  return '0x' + (n >>> 0).toString(16).padStart(8, '0');
}
