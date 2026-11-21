import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serializeReplay, type Replay } from '@reinos/shared';
import { main } from '../src/cli';

export function tmpDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'headless-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeText(dir: string, name: string, text: string): string {
  const p = path.join(dir, name);
  writeFileSync(p, text);
  return p;
}

export function writeReplay(dir: string, name: string, r: Replay): string {
  return writeText(dir, name, serializeReplay(r));
}

export function runCli(argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
