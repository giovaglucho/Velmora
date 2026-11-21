// Node vs browser determinism (plan E1). Node generates the golden scenario and its hashes;
// the page (main thread and Worker) runs the same replay with the esbuild bundle of the sim.
import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  compareGolden,
  goldenScenario,
  hex32,
  loadSimData,
  readGolden,
  runReplay,
  type Replay,
  type SimData,
} from '../../tools/headless/src/index';
import { buildBrowserBundle } from '../../tools/headless/browser/build';

interface BrowserRun {
  finalHash: number;
  checkpoints: [number, number][];
  ok: boolean;
  context: string;
  elapsedMs: number;
}

interface Baseline {
  replay: Replay;
  data: SimData;
  finalHash: number;
  checkpoints: [number, number][];
  bundle: string;
}

// Playwright loads specs as CJS here, so __dirname is available.
const GOLDEN = path.resolve(__dirname, '../../tools/headless/golden.json');

let baseline: Baseline | undefined;

test.beforeAll(async () => {
  if (baseline !== undefined) return;
  const data = loadSimData();
  const replay = goldenScenario(readGolden(GOLDEN), data);
  const node = runReplay(replay, data);
  baseline = {
    replay,
    data,
    finalHash: node.finalHash,
    checkpoints: node.checkpoints,
    bundle: await buildBrowserBundle(
      path.resolve(__dirname, '../../tools/headless/browser/entry.ts'),
    ),
  };
});

function assertSame(label: string, got: BrowserRun, want: Baseline): void {
  // Readable diff: first divergent checkpoint, then the final hash.
  const bad = want.checkpoints.findIndex((c, i) => got.checkpoints[i]?.[1] !== c[1]);
  const msg = (what: string): string =>
    label +
    ': ' +
    what +
    ' (node finalHash ' +
    hex32(want.finalHash) +
    ', ' +
    label +
    ' ' +
    hex32(got.finalHash) +
    ')';
  expect(
    bad,
    bad < 0 ? '' : msg('first divergent checkpoint at turn ' + want.checkpoints[bad]?.[0]),
  ).toBe(-1);
  expect(got.checkpoints.length).toBe(want.checkpoints.length);
  expect(hex32(got.finalHash), msg('finalHash differs')).toBe(hex32(want.finalHash));
  expect(got.ok, label + ': replay finalHash/checkpoints must match the recording').toBe(true);
}

test('golden file matches Node (or is unpinned)', () => {
  const b = baseline as Baseline;
  const v = compareGolden(readGolden(GOLDEN), b.replay, {
    finalHash: b.finalHash,
    checkpoints: b.checkpoints,
  });
  if (v.kind === 'unpinned') {
    test.info().annotations.push({ type: 'golden', description: 'unpinned' });
    test.skip(!process.env.CI, 'golden.json unpinned');
  }
  expect(v.kind === 'match' ? 'match' : JSON.stringify(v)).toBe('match');
});

test('main thread: same finalHash and checkpoints as Node', async ({ page, browserName }, info) => {
  const b = baseline as Baseline;
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: b.bundle });
  const got = await page.evaluate(
    ({ replay, data }) =>
      (
        globalThis as unknown as { ReinosSim: { run(r: unknown, d: unknown): unknown } }
      ).ReinosSim.run(replay, data) as BrowserRun,
    { replay: b.replay, data: b.data },
  );
  info.annotations.push({
    type: 'finalHash',
    description:
      browserName + ' main ' + hex32(got.finalHash) + ' in ' + got.elapsedMs.toFixed(0) + ' ms',
  });
  assertSame(info.project.name + '/main', got, b);
});

test('Web Worker: same finalHash and checkpoints as Node', async ({ page, browserName }, info) => {
  // jitless is ~10x slower: only the main-thread case runs there (time budget <= 5 min).
  test.skip(info.project.name === 'chromium-jitless', 'jitless: main thread only');
  const b = baseline as Baseline;
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: b.bundle });
  const got = await page.evaluate(
    ({ source, replay, data }) =>
      (
        globalThis as unknown as {
          ReinosSim: { runInWorker(s: string, r: unknown, d: unknown): Promise<unknown> };
        }
      ).ReinosSim.runInWorker(source, replay, data) as Promise<BrowserRun>,
    { source: b.bundle, replay: b.replay, data: b.data },
  );
  expect(got.context).toBe('worker');
  info.annotations.push({
    type: 'finalHash',
    description:
      browserName + ' worker ' + hex32(got.finalHash) + ' in ' + got.elapsedMs.toFixed(0) + ' ms',
  });
  assertSame(info.project.name + '/worker', got, b);
});

test('negative control: a mutated command changes the browser hash', async ({ page }, info) => {
  test.skip(info.project.name === 'chromium-jitless', 'jitless: main thread only');
  const b = baseline as Baseline;
  const mutated = JSON.parse(JSON.stringify(b.replay)) as Replay;
  const first = mutated.turns[0]?.cmds[0];
  if (first?.target) first.target.x = first.target.x === 500 ? 1500 : first.target.x - 1000;
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: b.bundle });
  const got = await page.evaluate(
    ({ replay, data }) =>
      (
        globalThis as unknown as { ReinosSim: { run(r: unknown, d: unknown): unknown } }
      ).ReinosSim.run(replay, data) as BrowserRun,
    { replay: mutated, data: b.data },
  );
  expect(got.ok).toBe(false);
  expect(got.finalHash).not.toBe(b.finalHash);
  info.annotations.push({ type: 'control', description: 'mutated hash ' + hex32(got.finalHash) });
});
