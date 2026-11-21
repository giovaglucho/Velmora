# @reinos/lint-sim

Lint de determinismo para `packages/sim/src` y `packages/shared/src/{fixed,prng,hash}*.ts`.
Usa el AST (y el type checker) de TypeScript. `pnpm lint:sim` sale con codigo 1 si hay violaciones (`archivo:linea [regla] mensaje`).
Tambien acepta rutas: `node tools/lint-sim/run.mjs ruta/archivo.ts`.

| Regla | Prohibido |
|---|---|
| no-float-literal | literales con parte decimal (`1.5`, `1.0`, `5.`) o exponente negativo (`1e-3`). `1e3`, hex/bin/oct OK |
| no-division | `/` y `/=`, salvo truncado explicito inmediato: `Math.trunc(a / b)`, `(a / b) \| 0`, `>> 0`, `>>> 0`, `~~(a / b)`; o dentro de un archivo `fixed*.ts` (helpers de punto fijo) |
| no-exponent | `**`, `**=` |
| no-math-random | `Math.random` |
| no-math | todo `Math.*` salvo `min max abs trunc imul clz32 sign` (incluye constantes como `Math.PI`) |
| no-time | `Date.now`, `new Date`, `performance.now` |
| no-timers | `setTimeout`, `setInterval`, `setImmediate`, `requestAnimationFrame`... (usar ticks) |
| no-dom | imports de `react`, `react-dom`, `pixi.js`, `@pixi/*`, jsdom...; uso de `window`, `document`, `navigator`, `localStorage`...; `/// <reference lib="dom">` |
| no-unordered-iteration | `for..of`, spread, `.forEach/.keys/.values/.entries`, `Array.from` sobre `Map`/`Set` (por tipo), salvo que el recorrido este dentro de una cadena `.sort(...)`/`.toSorted(...)`, p. ej. `[...m.keys()].sort((a, b) => a - b)` |
| no-parsefloat | `parseFloat`, `Number.parseFloat` |
| no-tofixed | `.toFixed`, `.toPrecision`, `.toExponential` |

## Escape
`// lint-sim-allow: <motivo>` en la misma linea (o en una linea de comentario inmediatamente anterior). El motivo es obligatorio; sin motivo no cuenta.

## Tests
`pnpm --filter @reinos/lint-sim test` (fixtures en `test/fixtures/{good,bad}`; cada regla tiene un caso malo y uno bueno).
