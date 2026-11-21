import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lintFiles } from '../lint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (kind: 'good' | 'bad', name: string): string =>
  path.join(here, 'fixtures', kind, `${name}.ts`);
const lint = (kind: 'good' | 'bad', name: string) => lintFiles([fx(kind, name)]);

// regla -> numero minimo de violaciones esperadas en el fixture malo (todas de esa regla)
const RULES: Record<string, number> = {
  'no-float-literal': 3,
  'no-division': 2,
  'no-exponent': 1,
  'no-math-random': 1,
  'no-math': 6,
  'no-time': 3,
  'no-timers': 2,
  'no-dom': 4,
  'no-unordered-iteration': 7,
  'no-parsefloat': 2,
  'no-tofixed': 1,
};

describe('lint-sim reglas', () => {
  for (const [rule, count] of Object.entries(RULES)) {
    it(`${rule}: el fixture malo falla`, () => {
      const v = lint('bad', rule);
      expect(v.length).toBeGreaterThanOrEqual(count);
      expect(v.every((x) => x.rule === rule)).toBe(true);
      expect(v.every((x) => x.line >= 1)).toBe(true);
    });
    it(`${rule}: el fixture bueno pasa`, () => {
      expect(lint('good', rule)).toEqual([]);
    });
  }

  it('no-unordered-iteration detecta cada forma por linea', () => {
    expect(lint('bad', 'no-unordered-iteration').map((v) => v.line)).toEqual([
      5, 6, 7, 8, 9, 10, 11,
    ]);
  });
  it('no-dom detecta el import y los globales', () => {
    expect(lint('bad', 'no-dom').map((v) => v.line)).toEqual([1, 2, 4, 5]);
  });
});

describe('escape lint-sim-allow', () => {
  it('con motivo (misma linea o linea previa) suprime', () => {
    expect(lint('good', 'escape')).toEqual([]);
  });
  it('sin motivo no suprime', () => {
    const v = lint('bad', 'escape-without-reason');
    expect(v.map((x) => x.rule)).toEqual(['no-math-random']);
  });
});

describe('run.mjs (CLI)', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(here, '..', 'run.mjs'), ...args], { encoding: 'utf8' });
  it('exit 1 con archivo:linea sobre un fixture malo', () => {
    const r = run(fx('bad', 'no-math-random'));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no-math-random\.ts:1 {2}\[no-math-random\]/);
  });
  it('exit 0 sobre un fixture bueno', () => {
    expect(run(fx('good', 'no-math')).status).toBe(0);
  });
  it('los fixtures existen para todas las reglas', () => {
    for (const r of Object.keys(RULES)) {
      expect(fs.existsSync(fx('bad', r))).toBe(true);
      expect(fs.existsSync(fx('good', r))).toBe(true);
    }
  });
});
