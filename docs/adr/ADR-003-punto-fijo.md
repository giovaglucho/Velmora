# ADR-003: Simulacion determinista en punto fijo

## Contexto

El lockstep (ADR-002) requiere que todos los clientes produzcan exactamente el mismo estado a partir de los mismos comandos, en distintos navegadores y plataformas. Los floats, `Math.random`, el reloj y el orden de iteracion no controlado rompen esa garantia (GDD 15.2).

## Decision

- **Tick fijo de 20 Hz** (50 ms de juego). A velocidad 1,7 son 34 ticks por segundo real. El render interpola entre los dos ultimos estados.
- **Punto fijo entero:** posiciones, velocidades y danos en enteros con **escala 1/1000** de casilla (`economy.fixedScale` en `@reinos/data`; `toFixed` convierte valores del GDD solo en tiempo de carga de datos, fuera de la sim).
- **Trigonometria por tablas enteras**; prohibidos `Math.sin/cos` y similares.
- **PRNG xoshiro128\*\*** (`packages/shared/src/prng.ts`), 4 x uint32, solo enteros. `createPrng(seed)` expande la semilla uint32 con splitmix32; `nextU32()`, `nextInt(bound)` con rechazo para evitar sesgo de modulo, `getState()` para snapshots, `createPrngFromState`. El estado todo-ceros se corrige.
- **Hash FNV-1a de 32 bits** (`packages/shared/src/hash.ts`): `fnv1aByte`, `fnv1aInt32` (little-endian), `hashInts`, `hashBytes`. Se calcula cada turno sobre componentes clave.
- **ECS con arrays tipados (SoA)** e iteracion por id ascendente. Los comandos son la unica entrada de la sim.
- **Reglas aplicadas por `pnpm lint:sim`** (`tools/lint-sim`, sobre `packages/sim/src` y `packages/shared/src/{fixed,prng,hash}*.ts`; AST + type checker de TypeScript):
  - `no-float-literal`: sin literales decimales ni exponente negativo.
  - `no-division`: sin `/` ni `/=` salvo truncado explicito inmediato (`Math.trunc(a / b)`, `| 0`, `>> 0`, `>>> 0`, `~~`) o dentro de archivos `fixed*.ts`.
  - `no-exponent`: sin `**`.
  - `no-math-random`.
  - `no-math`: solo `min max abs trunc imul clz32 sign`.
  - `no-time`: sin `Date.now`, `new Date`, `performance.now`.
  - `no-timers`: sin `setTimeout`/`setInterval`/`requestAnimationFrame`; se usan ticks.
  - `no-dom`: sin imports ni globales de DOM, react o pixi.
  - `no-unordered-iteration`: sin recorrer `Map`/`Set` salvo ordenado con `.sort(...)`.
  - `no-parsefloat` y `no-tofixed` (`toFixed`, `toPrecision`, `toExponential`).
  - Escape: `// lint-sim-allow: <motivo>` (motivo obligatorio).
- La sim corre en un Web Worker y solo depende de `@reinos/shared` (y datos ya cargados).

## Alternativas consideradas

- **Floats con redondeo controlado:** el comportamiento de `Math.*` y de FMA puede variar entre motores; riesgo de desync intermitente imposible de reproducir.
- **Fixed-point con BigInt o libreria externa:** mas lento y dependencia innecesaria; int32 con escala 1000 alcanza.
- **WASM determinista:** garantiza aritmetica, pero agrega toolchain (ver ADR-001).
- **PRNG distinto (Mulberry32, PCG):** xoshiro128** tiene mejor calidad con estado de 128 bits y es simple en enteros de 32 bits.
- **Hash criptografico (SHA):** innecesario y costoso por turno; FNV-1a basta para detectar desync.

## Consecuencias

- Reproducibilidad total: replays y tests headless de regresion (`test:det`).
- Codigo de sim mas incomodo (sin `/` libre, sin floats); el lint lo hace cumplir en CI.
- Rangos: con int32 y escala 1000, hay que vigilar desbordes en productos (usar `Math.imul`, escalas intermedias).
- Un cambio en PRNG, hash o tablas rompe la compatibilidad de replays: requiere versionar y nuevo ADR.
- FNV-1a no es resistente a colisiones adversarias; no es mecanismo anti-trampa.

## Estado

Aceptado.
