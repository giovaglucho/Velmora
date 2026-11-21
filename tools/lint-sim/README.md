# @reinos/lint-sim

Lint de determinismo para todo `packages/sim/src` y `packages/shared/src` (`.ts`, `.tsx`, `.mts`; se excluyen `.d.ts` y tests `*.test.*`/`*.spec.*`).
Usa el AST (y el type checker) de TypeScript. `pnpm lint:sim` sale con codigo 1 si hay violaciones (`archivo:linea [regla] mensaje`).
Tambien acepta rutas: `node tools/lint-sim/run.mjs ruta/archivo.ts`.

| Regla                  | Prohibido                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no-float-literal       | literales con parte decimal (`1.5`, `1.0`, `5.`) o exponente negativo (`1e-3`). `1e3`, hex/bin/oct OK                                                                                                                                             |
| no-division            | `/` y `/=`, salvo truncado explicito inmediato: `Math.trunc(a / b)`, `(a / b) \| 0`, `>> 0`, `>>> 0`, `~~(a / b)`; o dentro de la ruta exacta `packages/shared/src/fixed.ts` (helper de punto fijo; un `fixed.ts` en otra carpeta NO esta exento) |
| no-exponent            | `**`, `**=`                                                                                                                                                                                                                                       |
| no-math-random         | `Math.random`                                                                                                                                                                                                                                     |
| no-math                | todo `Math.*` salvo `min max abs trunc imul clz32 sign` (incluye constantes como `Math.PI`)                                                                                                                                                       |
| no-time                | `Date.now`, `new Date`, `performance.now`                                                                                                                                                                                                         |
| no-timers              | `setTimeout`, `setInterval`, `setImmediate`, `requestAnimationFrame`... (usar ticks)                                                                                                                                                              |
| no-dom                 | imports de `react`, `react-dom`, `pixi.js`, `@pixi/*`, jsdom...; uso de `window`, `document`, `navigator`, `localStorage`...; `/// <reference lib="dom">`                                                                                         |
| no-unordered-iteration | `for..of`, spread, `.forEach/.keys/.values/.entries`, `Array.from` sobre `Map`/`Set` (por tipo), salvo que el recorrido este dentro de una cadena `.sort(...)`/`.toSorted(...)`, p. ej. `[...m.keys()].sort((a, b) => a - b)`                     |
| no-parsefloat          | `parseFloat`, `Number.parseFloat`                                                                                                                                                                                                                 |
| no-tofixed             | `.toFixed`, `.toPrecision`, `.toExponential`                                                                                                                                                                                                      |
| no-crypto              | `crypto.*` (global o `globalThis.crypto`), imports de `crypto`/`node:crypto`                                                                                                                                                                      |
| no-float-array         | `Float16Array`, `Float32Array`, `Float64Array`, `DataView.get/setFloat32/64`                                                                                                                                                                      |
| no-string-to-number    | `Number(x)` y `+x` cuando el tipo de `x` es `string` (o `any`/`unknown`)                                                                                                                                                                          |
| no-json-parse          | `JSON.parse` (puede introducir floats; los datos entran por `@reinos/data`)                                                                                                                                                                       |
| no-global-alias        | `const g = globalThis` (alias que esquiva el resto de reglas)                                                                                                                                                                                     |

Ademas: `Math` solo se acepta como `Math.<permitido>(...)`; alias (`const M = Math`, `const { random } = Math`) estan prohibidos (no-math). `globalThis.X` se trata igual que `X` (`globalThis.Date.now`, `globalThis.setTimeout`, `globalThis.Math.random`, `globalThis.crypto`...). `Object.fromEntries/entries/keys/values` sobre un `Map`/`Set` (o su `.entries()/.keys()/.values()`) sin `.sort(...)` cuenta como no-unordered-iteration.

### Lo que NO se detecta (limites del analisis estatico)

- Floats que entran como datos en runtime (p. ej. un `number` no entero que llega por red o por un JSON ya parseado fuera de sim): solo se atajan los puntos de entrada visibles (`JSON.parse`, `Number(string)`, `+string`, `parseFloat`). Un `string` convertido via `any` indirecto o `as` puede escaparse; la defensa real es validar con `@reinos/data` (enteros) en el borde.
- Aliases indirectos de globales (`const g = globalThis; g.Date.now()` solo se marca por el alias; `const D = Date; D.now()`, `const f = Math.random` sin `Math` suelto no se ve por alias de funcion `Date`/`performance`).
- Acceso dinamico (`globalThis['Date']`, `(0, eval)(...)`, `Reflect.get(Math, 'random')`), `import()` dinamico y codigo `.js`/`.mjs` dentro de sim.
- Aritmetica entera que desborda 2^53 o `number` no entero producido por division oculta tras una funcion de terceros.
- Recorrido de `Object.keys` sobre objetos planos: el orden de claves de JS es determinista (enteros ascendentes, luego insercion), no se prohibe.

## Escape

`// lint-sim-allow: <motivo>` en la misma linea (o en una linea de comentario inmediatamente anterior). El motivo es obligatorio y debe tener al menos 5 letras; sin motivo (o con uno mas corto, p. ej. `ok`) no cuenta.

## Tests

`pnpm --filter @reinos/lint-sim test` (fixtures en `test/fixtures/{good,bad}`; cada regla tiene un caso malo y uno bueno). En los fixtures malos, cada violacion esperada se marca en su misma linea con `// expect-violation: <regla>`; el test compara las lineas marcadas con las reportadas (sin numeros de linea fijos). La carpeta de fixtures esta en `.prettierignore` y en los `ignores` de ESLint para que ningun formateador mueva el marcador de su linea.
