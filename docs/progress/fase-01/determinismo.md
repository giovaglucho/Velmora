# Determinismo multi-entorno (Fase 1, K1)

Escenario: `thousand` (1000 unidades x 10 000 ticks = 2500 turnos, mapa 200x200 con 25 % de obstáculos, comandos `move`/`stop` repartidos, goals inalcanzables incluidos), generado por `tools/headless/src/scenario.ts` con semilla 1. El hash comparado es `hashFull()` final más un checkpoint de `hash()` cada 100 turnos (25 checkpoints): un desacuerdo se localiza en el primer checkpoint divergente.

## Estado de verificación

| Entorno                                               | Versión                       | Verificado aquí | Resultado                                   |
| ----------------------------------------------------- | ----------------------------- | --------------- | ------------------------------------------- |
| Node (hilo principal)                                 | v22.23.5                      | si              | referencia                                  |
| Node `--jitless`                                      | v22.23.5                      | si              | idéntico a Node                             |
| Chromium, hilo principal                              | Chrome for Testing 153.0.8010 | si              | finalHash y 25 checkpoints idénticos a Node |
| Chromium, Web Worker                                  | Chrome for Testing 153.0.8010 | si              | finalHash y 25 checkpoints idénticos a Node |
| Chromium `--js-flags=--jitless` (solo hilo principal) | Chrome for Testing 153.0.8010 | si              | finalHash y 25 checkpoints idénticos a Node |
| Firefox (hilo y Worker)                               | el de `playwright install`    | **NO**          | pendiente de CI (`test-det-browsers`)       |
| WebKit (hilo y Worker)                                | el de `playwright install`    | **NO**          | pendiente de CI (`test-det-browsers`)       |

Firefox y WebKit no existen en este sandbox y no se instalan aquí. El proyecto de Playwright solo los activa con `PW_ALL_BROWSERS=1`; el job `test-det-browsers` de `.github/workflows/ci.yml` hace `playwright install --with-deps chromium firefox webkit` y los ejecuta. K1 queda **cerrado para Node y Chromium** y **abierto para Firefox/WebKit** hasta la primera corrida verde en GitHub (TODO-HUMANO: push/merge para que el job corra).

El golden **ya está pineado**: `tools/headless/golden.json` (escenario `thousand`, semilla 1, `dataVersion` 0.2.0, `replayFormatVersion` 1) con `finalHash` = 2674808742 = `0x9f6e57a6` y los 25 checkpoints. `pnpm test:det` lo compara con la corrida de Node y falla si el hash cambia o si el golden queda `stale` (cambió `REPLAY_FORMAT_VERSION` o `DATA_VERSION`). Los navegadores se comparan contra Node en la misma corrida.

**Estado honesto de K1:** verificados aquí: Node, Node `--jitless`, Chromium en hilo principal y Chromium en Web Worker (más Chromium `--jitless`, solo hilo principal). **Pendientes de CI: Firefox y WebKit** (el job `test-det-browsers` aún no corrió en GitHub). K1 sigue **abierto** hasta esa primera corrida verde (TODO-HUMANO: push/merge para que el job corra).

Control negativo: la spec incluye un caso que muta un comando en el navegador y exige que el hash cambie (descarta que la comparación sea vacua).

## Reproducir

```
pnpm test:det                        # Node: escenario completo contra golden.json
pnpm test:det:browsers               # Node vs Chromium (principal, Worker) y Chromium --jitless
PW_ALL_BROWSERS=1 pnpm test:det:browsers   # además Firefox y WebKit (requiere playwright install)
node --jitless --import tsx tools/headless/src/cli.ts golden check   # Node jitless (desde tools/headless)
pnpm --filter @reinos/headless run golden:update   # re-pinear tras un cambio intencionado
```

Tiempos medidos aquí: con el movimiento stub, Node ~2 s, Chromium ~2 s por caso y `--jitless` ~22 s (Node jitless ~40 s); con el movimiento real (pathfinding) Node ~45 s, Chromium ~14 s por caso y `--jitless` ~2,4 min por caso. Por eso `--jitless` solo corre el caso de hilo principal (sin Worker ni control negativo) y la suite `test:det:browsers` queda en ~4,5 min (medido: 4 m 33 s).

## Cómo funciona

- `tools/headless/browser/entry.ts` se empaqueta con esbuild (IIFE) y expone `ReinosSim.run` (hilo principal) y `ReinosSim.runInWorker` (el mismo bundle sirve de script del Worker vía Blob).
- `e2e/determinismo/determinism.spec.ts` genera el escenario y el hash de Node, carga el bundle con `page.addScriptTag` y compara `finalHash` y checkpoints (mensaje con el primer turno divergente y los hashes en hex).
- `playwright.det.config.ts`: proyectos `chromium`, `chromium-jitless` y, solo con `PW_ALL_BROWSERS=1`, `firefox` y `webkit`.

## Cuando cambie el movimiento

1. `pnpm test:det:browsers` (Node vs navegadores) debe seguir verde sin tocar nada.
2. `pnpm --filter @reinos/headless run golden:update` y commitear `golden.json` (si cambia `REPLAY_FORMAT_VERSION` o `DATA_VERSION`, el test lo marca como `stale`).
3. Actualizar el hash (hoy `0x9f6e57a6`) en esta página y volver a ejecutar `PW_ALL_BROWSERS=1` en CI.

## Adenda (F2/S2): `buildSimData` y empates .5

`buildSimData` corre en cada cliente (fuera de `lint:sim`). `e2e/determinismo/determinism.spec.ts` (caso "buildSimData: simDataHash ...") empaqueta `@reinos/data` con esbuild (`tools/headless/browser/data-entry.ts`), construye `SimData` en la página y compara `simDataHash` y la columna `speedFxPerTick` contra Node para: (a) los datos incluidos y (b) 8 tablas sintéticas (`tools/headless/src/tie-table.ts`) con velocidades `(2k+1)/100` y vecinos a 1 ulp, que producen empates `x.5` exactos de `speed * fixedScale / TICKS_PER_SECOND`.

El redondeo pasó de `Math.round` a `roundHalfUp` explícito (`floor(x)` más 1 si `x - floor(x) >= 0.5`, resta exacta en IEEE-754); es idéntico a `Math.round` para no negativos (test de equivalencia), por lo que **ningún valor existente cambia**: `simDataHash` de los datos incluidos = 2130807079 y el golden (`0x9f6e57a6`) no varía. Chromium verificado; Firefox y WebKit pendientes de CI (`PW_ALL_BROWSERS=1`, TODO-HUMANO).
