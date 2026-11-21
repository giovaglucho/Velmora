#!/usr/bin/env node
// Uso: node tools/lint-sim/run.mjs [archivos o carpetas...]   (sin args: packages/sim/src y shared/src/{fixed,prng,hash}*)
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { lintFiles, defaultTargets } from "./lint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
let files;
if (args.length === 0) files = defaultTargets(root);
else {
  files = [];
  const collect = (p) => {
    if (fs.statSync(p).isDirectory()) for (const e of fs.readdirSync(p).sort()) collect(path.join(p, e));
    else if (p.endsWith(".ts") && !p.endsWith(".d.ts")) files.push(p);
  };
  for (const a of args) collect(path.resolve(a));
}
const violations = lintFiles(files);
for (const v of violations) console.error(`${path.relative(process.cwd(), v.file)}:${v.line}  [${v.rule}] ${v.message}`);
if (violations.length) {
  console.error(`\nlint:sim FALLO: ${violations.length} violacion(es) en ${new Set(violations.map((v) => v.file)).size} archivo(s).`);
  process.exit(1);
}
console.log(`lint:sim OK (${files.length} archivo(s) revisados)`);
