// Bundles the fog harness with the esbuild that ships with the client's toolchain (no new dependency).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function bundleFogHarness(): { js: string; html: string } {
  const root = process.cwd();
  const client = path.join(root, 'packages/client');
  const esbuild = path.join(client, 'node_modules/.bin/esbuild');
  const outDir = path.join(root, 'test-results/render/fog-harness');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'fog-harness.js');
  execFileSync(
    esbuild,
    [
      path.join(root, 'e2e/render/fog-harness/main.ts'),
      '--bundle',
      '--format=iife',
      '--platform=browser',
      '--target=es2022',
      '--log-level=warning',
      `--outfile=${outFile}`,
    ],
    { env: { ...process.env, NODE_PATH: path.join(client, 'node_modules') }, stdio: 'inherit' },
  );
  return {
    js: fs.readFileSync(outFile, 'utf8'),
    html: fs.readFileSync(path.join(root, 'e2e/render/fog-harness/index.html'), 'utf8'),
  };
}
