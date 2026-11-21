import { build } from 'esbuild';

/** Bundles the simulation for browsers/Workers (IIFE, no minification: keep it debuggable). `entry` is the absolute path of browser/entry.ts (no import.meta: Playwright loads this as CJS). */
export async function buildBrowserBundle(entry: string): Promise<string> {
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: false,
    legalComments: 'none',
  });
  const out = res.outputFiles[0];
  if (out === undefined) throw new Error('esbuild produced no output');
  return out.text;
}
