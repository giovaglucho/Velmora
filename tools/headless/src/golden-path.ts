import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** ESM only (uses import.meta): not re-exported from index.ts so CJS loaders (Playwright) can import it. */
export const GOLDEN_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../golden.json',
);
