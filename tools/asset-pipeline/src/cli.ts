import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAll } from './provisional/generate.js';

/** `pnpm assets:gen` -> packages/client/public/assets/provisional/ (ADR-006 §9). */
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? resolve(here, '../../../packages/client/public/assets/provisional');
const files = writeAll(out);
let total = 0;
for (const f of files) {
  total += f.bytes.length;
  console.log(`  ${f.name.padEnd(16)} ${String(f.bytes.length).padStart(8)} B`);
}
console.log(`assets:gen OK -> ${out} (${files.length} files, ${(total / 1024).toFixed(0)} KiB)`);
