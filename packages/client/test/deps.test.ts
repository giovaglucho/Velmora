// ADR-006 §2 — dependency boundaries, independent of ESLint (belt and braces for the parallel lanes).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

interface Imp {
  spec: string;
  typeOnly: boolean;
}
function importsOf(file: string): Imp[] {
  const src = readFileSync(file, 'utf8');
  const out: Imp[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'"\n;]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push({ spec: m[3] ?? '', typeOnly: !!m[2] });
  const dyn = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = dyn.exec(src); m; m = dyn.exec(src)) out.push({ spec: m[1] ?? '', typeOnly: false });
  return out;
}

const files = walk(SRC).map((f) => ({
  rel: relative(SRC, f).replaceAll('\\', '/'),
  imps: importsOf(f),
}));
const inDir = (d: string) => files.filter((f) => f.rel.startsWith(d + '/'));
const PURE =
  /^render\/(iso|camera|culling|depth|constants|types)\.ts$|^render\/fog\/visionGrid\.ts$|^render\/terrain\/terrainMap\.ts$|^render\/minimap\/mapping\.ts$/;

function bad(group: typeof files, pred: (i: Imp) => boolean): string[] {
  return group.flatMap((f) => f.imps.filter(pred).map((i) => `${f.rel} -> ${i.spec}`));
}
const isSim = (s: string) => s === '@reinos/sim' || s.startsWith('@reinos/sim/');
const isPixi = (s: string) => s === 'pixi.js' || s.startsWith('pixi.js/');
const isReact = (s: string) => /^(react|react-dom|zustand)(\/|$)/.test(s);

describe('ADR-006 §2 import boundaries', () => {
  it('finds the scaffold', () => expect(files.length).toBeGreaterThan(20));
  it('worker/ has no pixi/react', () =>
    expect(bad(inDir('worker'), (i) => isPixi(i.spec) || isReact(i.spec))).toEqual([]));
  it('render/ never imports @reinos/sim, react, input/ or ui/', () =>
    expect(
      bad(
        inDir('render'),
        (i) => (isSim(i.spec) && !i.typeOnly) || isReact(i.spec) || /\/(input|ui)\//.test(i.spec),
      ),
    ).toEqual([]));
  it('render/ only uses worker/snapshot', () =>
    expect(
      bad(
        inDir('render'),
        (i) => /\/worker\//.test(i.spec) && !/\/worker\/snapshot$/.test(i.spec) && !i.typeOnly,
      ),
    ).toEqual([]));
  it('pure render modules: only @reinos/shared and relative pure/type imports', () =>
    expect(
      bad(
        files.filter((f) => PURE.test(f.rel)),
        (i) =>
          isPixi(i.spec) || isReact(i.spec) || isSim(i.spec) || i.spec.startsWith('@reinos/data'),
      ),
    ).toEqual([]));
  it('input/ has no pixi runtime, react, sim runtime or ui/', () =>
    expect(
      bad(
        inDir('input'),
        (i) =>
          (isPixi(i.spec) && !i.typeOnly) ||
          isReact(i.spec) ||
          (isSim(i.spec) && !i.typeOnly) ||
          /\/ui\//.test(i.spec),
      ),
    ).toEqual([]));
  it('ui/ (except bridge.ts) has no pixi/sim and no runtime worker/render/input', () =>
    expect(
      bad(
        inDir('ui').filter((f) => f.rel !== 'ui/bridge.ts'),
        (i) =>
          isPixi(i.spec) ||
          isSim(i.spec) ||
          (!i.typeOnly && /\/(worker|render|input)\//.test(i.spec)),
      ),
    ).toEqual([]));
  it('@reinos/sim is imported at runtime only from worker/', () =>
    expect(
      bad(
        files.filter((f) => !f.rel.startsWith('worker/')),
        (i) => isSim(i.spec) && !i.typeOnly,
      ),
    ).toEqual([]));
});
