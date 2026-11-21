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

El hash numérico concreto no se pinea todavía (el movimiento está cambiando): `tools/headless/golden.json` está sin fijar (`finalHash: null`). El test `pnpm test:det` comprueba entonces solo reproducibilidad (la corrida generadora y una repetición independiente coinciden) y **falla en CI** hasta que alguien ejecute `golden:update` con el movimiento definitivo. Los hashes de la tabla anterior son relativos (Node = navegador); el valor se anota aquí al pinear.

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
3. Actualizar el hash en esta página y volver a ejecutar `PW_ALL_BROWSERS=1` en CI.
