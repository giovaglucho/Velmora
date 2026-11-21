import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lintFiles } from '../lint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, 'fixtures');

/** Todos los .ts bajo una carpeta de fixtures (recursivo, orden estable). */
function listFixtures(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFixtures(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Los fixtures malos marcan cada violacion esperada con `// expect-violation: <regla>` en la MISMA linea
 * que la violacion. Asi el test no depende de numeros de linea fijos (y los fixtures estan en .prettierignore).
 */
function expectedViolations(file: string): string[] {
  const out: string[] = [];
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((text, i) => {
      const m = /\/\/\s*expect-violation:\s*([a-z-]+)/.exec(text);
      if (m) out.push(`${i + 1}:${m[1]}`);
    });
  return out;
}
const actual = (file: string, opts?: object): string[] =>
  lintFiles([file], opts).map((v) => `${v.line}:${v.rule}`);
const rel = (f: string): string => path.relative(FIXTURES, f);

describe('fixtures malos: las lineas marcadas con expect-violation coinciden con las violaciones', () => {
  const bad = listFixtures(path.join(FIXTURES, 'bad'));
  it('hay fixtures malos', () => expect(bad.length).toBeGreaterThan(15));
  for (const f of bad) {
    it(rel(f), () => {
      const expected = expectedViolations(f);
      expect(expected.length).toBeGreaterThan(0);
      expect(actual(f)).toEqual(expected);
    });
  }
});

describe('fixtures buenos: sin violaciones', () => {
  for (const f of listFixtures(path.join(FIXTURES, 'good'))) {
    it(rel(f), () => expect(actual(f)).toEqual([]));
  }
});

describe('cobertura de reglas', () => {
  // Cada regla debe tener al menos un fixture malo que la dispare (por marcador) y uno bueno con su nombre.
  const RULES = [
    'no-float-literal',
    'no-division',
    'no-exponent',
    'no-math-random',
    'no-math',
    'no-time',
    'no-timers',
    'no-dom',
    'no-unordered-iteration',
    'no-parsefloat',
    'no-tofixed',
    'no-crypto',
    'no-float-array',
    'no-string-to-number',
    'no-json-parse',
    'no-global-alias',
  ];
  const marked = new Set(
    listFixtures(path.join(FIXTURES, 'bad')).flatMap((f) =>
      expectedViolations(f).map((e) => e.split(':')[1]),
    ),
  );
  for (const r of RULES) it(`${r} tiene fixture malo`, () => expect(marked.has(r)).toBe(true));
  it('cada fixture malo de regla tiene su gemelo bueno', () => {
    const goods = new Set(
      listFixtures(path.join(FIXTURES, 'good')).map((f) => rel(f).replace(/^good./, '')),
    );
    for (const f of listFixtures(path.join(FIXTURES, 'bad'))) {
      const name = rel(f).replace(/^bad./, '');
      if (/^(escape|other-dir)/.test(name)) continue;
      expect(goods.has(name), name).toBe(true);
    }
  });
});

describe('exencion de division', () => {
  const inOtherDir = path.join(FIXTURES, 'bad', 'other-dir', 'fixed.ts');
  const helper = path.join(FIXTURES, 'helper', 'fixed.ts');
  it('un archivo llamado fixed.ts en otra ruta NO esta exento', () => {
    expect(actual(inOtherDir)).toEqual(['1:no-division']);
  });
  it('solo la ruta exacta configurada esta exenta', () => {
    expect(actual(helper)).toEqual(['1:no-division']);
    expect(actual(helper, { divisionHelpers: [helper] })).toEqual([]);
  });
});

describe('escape lint-sim-allow', () => {
  it('con motivo (misma linea o linea previa) suprime', () => {
    expect(actual(path.join(FIXTURES, 'good', 'escape.ts'))).toEqual([]);
  });
  it('sin motivo o con motivo de < 5 letras no suprime', () => {
    expect(actual(path.join(FIXTURES, 'bad', 'escape-without-reason.ts'))).toEqual([
      '1:no-math-random',
    ]);
    expect(actual(path.join(FIXTURES, 'bad', 'escape-short-reason.ts'))).toEqual([
      '1:no-math-random',
    ]);
  });
});

describe('run.mjs (CLI)', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(here, '..', 'run.mjs'), ...args], { encoding: 'utf8' });
  it('exit 1 con archivo:linea sobre un fixture malo', () => {
    const f = path.join(FIXTURES, 'bad', 'no-math-random.ts');
    const [line] = expectedViolations(f)[0]!.split(':');
    const r = run(f);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`no-math-random.ts:${line}  [no-math-random]`);
  });
  it('exit 0 sobre un fixture bueno', () => {
    expect(run(path.join(FIXTURES, 'good', 'no-math.ts')).status).toBe(0);
  });
});
