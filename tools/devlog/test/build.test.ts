import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDevlog, readmeFor, REPO_ROOT } from '../src/build.js';

function sandbox(json?: string) {
  const root = mkdtempSync(join(tmpdir(), 'devlog-'));
  mkdirSync(join(root, 'docs/progress/fase-00'), { recursive: true });
  const dst = join(root, 'docs/progress/fase-00/devlog.json');
  if (json === undefined) cpSync(join(REPO_ROOT, 'docs/progress/fase-00/devlog.json'), dst);
  else writeFileSync(dst, json);
  return root;
}

describe('devlog build', () => {
  it('readmeFor muestra las notas opcionales como viñetas', () => {
    const base = {
      fase: 2,
      titulo: 'T',
      porcentaje: 21,
      ahoraSePuede: 'x',
      metricas: { fps: null, tick: null, tests: null },
      siguiente: 's',
      imagenes: [],
    };
    expect(readmeFor(base)).not.toContain('**Notas:**');
    const md = readmeFor({ ...base, notas: ['uno', 'dos'] });
    expect(md).toContain('**Notas:**\n\n- uno\n- dos\n\n**Siguiente:** s');
  });

  it('genera index.html con la tarjeta de fase-00 y la barra de hitos marcada', () => {
    const root = sandbox();
    const r = buildDevlog({ root, outDir: join(root, 'out') });
    const html = readFileSync(join(r.outDir, 'index.html'), 'utf8');
    expect(html).toContain('id="fase-00"');
    expect(html).toContain('Fundaciones');
    expect(html).toContain('Hito 5');
    expect(html).toMatch(
      /class="hito actual" aria-current="step"><span class="dot"><\/span><b>Hito 1/,
    );
    expect(existsSync(join(r.outDir, 'devlog.css'))).toBe(true);
    expect(readFileSync(join(root, 'docs/progress/fase-00/README.md'), 'utf8')).toContain(
      '# Fase 00 — Fundaciones (7% del plan)',
    );
  });
  it('falla con un JSON inválido', () => {
    const root = sandbox('{"fase":0}');
    expect(() => buildDevlog({ root, outDir: join(root, 'out') })).toThrow(/inválido/);
  });
});
