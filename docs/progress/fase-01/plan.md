# Fase 1 — Plan de tareas: núcleo de simulación determinista

Fuente: `docs/PLAN.md` Fase 1, GDD §15.2 y §7/§8, ADR-003, **ADR-005** (contrato exacto entre A, B y C), `docs/contracts.md`. Autor: `architect`. Estado: propuesto.

**Objetivo:** la simulación corre headless, reproducible bit a bit, con unidades que se mueven por un mapa con obstáculos.

## 1. Criterios de fase (del PLAN) y cómo se verifican

| #   | Criterio                                                                               | Verificación (comando / evidencia)                                                                                                                                     | Tareas        |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| K1  | 1000 unidades × 10 000 ticks producen el mismo `finalHash` en los entornos disponibles | `pnpm test:det` (Node) + `pnpm test:det:browsers` (Chromium local; Firefox y WebKit en CI). Evidencia: `docs/progress/fase-01/determinism.md` con tabla entorno → hash | D2, D4, E1–E3 |
| K2  | Tick ≤ 3 ms con 400 unidades                                                           | `pnpm --filter @reinos/headless bench` → `docs/progress/fase-01/bench.md` (p95 por tick ≤ 3 ms, 400 unidades en movimiento, Node 22)                                   | D3            |
| K3  | 0 violaciones de `lint:sim`                                                            | `pnpm lint:sim` sale 0 con `fixed.ts`, `sim/src/**` completos; además `pnpm lint`, `pnpm typecheck`                                                                    | todas         |

**Entornos (honestidad de evidencia).** Aquí solo hay Node 22.23 y Chromium (`/opt/pw-browsers/chromium`, y `/usr/bin/google-chrome`); **no** hay Firefox ni WebKit y `playwright install` no se ejecuta en este entorno (ver `e2e/README.md`). Por tanto:

- Evidencia local de K1: Node = Chromium (hilo principal) = Chromium (Web Worker), más variantes extra del mismo motor (`node --jitless`, Chromium con `--js-flags=--jitless`) que **no cuentan** como Firefox/WebKit.
- Firefox y WebKit quedan **configurados** en `playwright.det.config.ts` y en el job de CI (`playwright install --with-deps firefox webkit`) y se corren allí. Hasta la primera corrida de CI en GitHub (puerta humana: push/merge a `main`, ver STATUS) K1 se registra como "3/4 verificados localmente, 2/4 pendientes de CI" y **no** se marca cerrado. No se baja el criterio.

## 2. Mapa de dependencias

```
T0 (andamiaje de contrato) ─┬─> A1 ─> A2
                            ├─> B1 ─> B2 ─> B3 ─> B4 ─────────────┐
                            └─> C1 ─> C2 ─> C3 ──┐                 │
                                   └─> C4 ───────┴─> C5 ─(+B3)─> D1 ─> D2 ─> D4 ─> E1 ─> E2/E3
                                                                  └─> D3 ─────────> F1 ─> F2
R1 (revisión ECS/comandos) tras B2 ; R2 (revisión final) tras D4 ; Z cierre
```

Paralelismo: tras T0, **tres carriles independientes**: A (A1→A2), B (B1→B4), C (C1→C4). Convergen en C5 (integración) y D. B y C se desacoplan por `MovementSystem` (ADR-005 §8) con un stub de T0, y por tipos de `shared` también de T0. A solo necesita ser mergeado antes de que B/C usen funciones numéricas reales: hasta entonces usan firmas/constantes de T0 (T0 exporta `fixed.ts` con las firmas del ADR y cuerpos mínimos correctos para `fxMul/fxDiv/clamp/isqrt` simples; A1 los sustituye por los definitivos y exactos).

Reglas de merge: cada tarea = una rama/PR corto contra la rama de trabajo; `pnpm typecheck && pnpm test && pnpm lint:sim` verdes antes de mergear; ninguna tarea edita carpetas de otro carril (propiedad en ADR-005 §11).

## 3. Tareas

Dueños: `architect`, `sim-engineer` (carril A y B), `sim-engineer (2º)` (carril C y T0b), `qa-engineer` (D, E), `devlog-reporter` (F), `reviewer` (R2). Estimación en días-agente (≤ 1).

### T0 — Andamiaje del contrato (0,5 d)

- **Dueño:** `sim-engineer (2º)`, supervisa `architect`. **Depende de:** ADR-005 propuesto.
- **Hace:**
  - `shared`: `commands.ts` (tipos + `validateCommandShape`), `simconfig.ts`, `simdata.ts`, esqueleto de `replay.ts` (tipos; `validateReplay` lanza "no implementado"), re-exports en `index.ts`; `fixed.ts` con constantes y firmas completas del ADR-005 §1–2 (cuerpos mínimos correctos).
  - `data`: bloque `movement` en `game.json` (+ Zod strict en `schemas/game.ts`), `buildSimData` en `packages/data/src/simdata.ts`, `DATA_VERSION = '0.2.0'`.
  - `sim`: carpetas vacías con `index.ts` y tipos (`World`, `Grid`, `Pathfinder`, `MovementSystem`, `Sim`) como interfaces; `steer/index.ts` con **stub** de movimiento en línea recta; `systems.ts`.
- **Criterio verificable:** `pnpm typecheck` y `pnpm lint:sim` verdes; `pnpm data:check` verde con `DATA_VERSION 0.2.0`; test `packages/data/test/simdata.test.ts`: `buildSimData(loadGameData())` cumple `SimData` (arrays de misma longitud que `units`, `speedFxPerTick[colono] === 40`, `fixedScale === FX_SCALE`); test de tipos en `tools/headless` (asignabilidad `SimData`). Los carriles A, B, C pueden compilar contra T0 sin conflictos.

### Carril A — Punto fijo

#### A1 — `fixed.ts` núcleo (0,5 d)

- **Dueño:** `sim-engineer`. **Depende de:** T0.
- **Hace:** implementación definitiva y exacta de `fxMul`, `fxDiv`, `mulDiv`, `isqrt`, `fxSqrt`, `distSq`, `dist`, `clamp`, `fxToTile`, `tileToFx`, `tileCenterFx`, `fxFromInt`, `fxToInt` (ADR-005 §2).
- **Criterio:** `packages/shared/test/fixed.test.ts` (Vitest, `BigInt` solo en el test): `isqrt` exacto para 10^6 valores con PRNG semillado + bordes (`0,1,2^k±1,2^53-1`); `fxMul/fxDiv/mulDiv` iguales a `BigInt` truncado hacia cero en todo el rango documentado, incluidos negativos; `RangeError` con divisor 0; `FX_SCALE === economy.fixedScale` (test en `tools/headless` o `data` que importa ambos). `pnpm lint:sim` = 0 sobre `shared/src`.

#### A2 — Tablas trigonométricas enteras (0,5 d)

- **Dueño:** `sim-engineer`. **Depende de:** A1.
- **Hace:** `tools/gen-trig.mjs` (genera `shared/src/trig-tables.ts` con `SIN_QUARTER[257]` y `ATAN_OCTANT[257]`), `sinT`, `cosT`, `mulTrig`, `atan2Idx` en `fixed.ts` (ADR-005 §2).
- **Criterio:** `packages/shared/test/trig.test.ts`: valores exactos `sinT(0/256/512/768)`; para los 1024 ángulos `|sinT(a) - round(16384*sin(2πa/1024))| ≤ 1` (referencia con `Math.sin` **solo en el test**), `sinT(a)^2 + cosT(a)^2` dentro de ±2·16384 del cuadrado de `TRIG_ONE`; simetrías exactas entre cuadrantes; `atan2Idx` con error ≤ 1 paso en 10^5 pares aleatorios y exactitud en los 8 ejes; **hash FNV-1a de las dos tablas pineado** (constante en el test). Re-ejecutar `node tools/gen-trig.mjs` no produce diff.

### Carril B — ECS, comandos, loop (`packages/sim`)

#### B1 — World SoA (0,75 d)

- **Dueño:** `sim-engineer`. **Depende de:** T0 (usa constantes de `fixed.ts`).
- **Hace:** `ecs/{columns,world,hash,index}.ts`: `createWorld`, `spawn`, `despawn`, `isAlive`, eids con generación, `HASHED_COLUMNS`/`UNHASHED_COLUMNS`, `hash`/`hashFull` (ADR-005 §3–4). `hashFull` incluye waypoints y puede recibir un `Grid` mínimo vía interfaz.
- **Criterio:** `packages/sim/test/ecs.test.ts`: spawn/despawn en orden dado produce eids y estado iguales entre dos mundos; reutilización LIFO y `gen` que envuelve de 32767 a 1; eid obsoleto → `isAlive` false y `despawn` false; ranura despawneada con todas las columnas a 0; iteración ascendente; capacidad agotada → `RangeError`; test de completitud (todo campo de `World` está en exactamente una de las dos listas de columnas); **vector dorado** de `hash()` para un mundo fijo de 5 entidades calculado con una implementación independiente (script Python de referencia, como el placeholder de F0) y comparado; `pnpm lint:sim` = 0.

#### B2 — Comandos (0,75 d)

- **Dueño:** `sim-engineer`. **Depende de:** B1, T0.
- **Hace:** `commands/{validate,system,index}.ts`: ordenación estable por `playerId`, rechazo de comandos, filtrado por propiedad/vigencia, semántica de `move`/`stop` (ADR-005 §5) contra la interfaz `MovementSystem` (usa el stub de T0). Completa `shared/validateCommandShape`.
- **Criterio:** `packages/sim/test/commands.test.ts`: tabla de casos (turno equivocado, jugador fuera de rango, `payload != null`, unidad ajena, unidad muerta, duplicados en `unitIds`, `eid` obsoleto tras reutilización de ranura, meta fuera de mapa → acotada, meta sobre casilla bloqueada → `nearestFree`); permutar el orden de comandos de **distintos** jugadores no cambia el `hashFull`; permutar `unitIds` no cambia el resultado; `stop` invalida una entrada en cola. Fuzz con PRNG semillado (10^4 comandos de forma aleatoria incluyendo basura: nunca lanza, `validateCommandShape` coherente con la sim).

#### R1 — Revisión del diseño del ECS y del formato de comandos (0,25 d)

- **Dueño:** `architect`. **Depende de:** B2 (y T0). **Es puerta de merge** para B3 (PLAN: "revisión del diseño del ECS y del formato de comandos antes del merge").
- **Criterio:** nota en `docs/progress/fase-01/review-r1.md` con veredicto (aprobado / cambios) contra ADR-005; si se pide un cambio de contrato, enmienda del ADR **antes** de tocar código; ADR-005 pasa a "Aceptado".

#### B3 — Loop y hash por turno (0,75 d)

- **Dueño:** `sim-engineer`. **Depende de:** R1.
- **Hace:** `loop/sim.ts`: `createSim`, `step`, `stepTick`, orden de sistemas (ADR-005 §8), `TurnResult`, hash por turno, aplicación de `config.spawns` y `loadMap`; re-export en `sim/src/index.ts`.
- **Criterio:** `packages/sim/test/loop.test.ts`: `step` ≡ 4× `stepTick` (mismo `hashFull`); `stepTick` con comandos fuera de límite de turno → `RangeError`; `createSim` rechaza `dataVersion` distinto, semilla no uint32, unidad desconocida, spawn en casilla bloqueada; mismo (seed, config, comandos) → mismo hash en dos instancias; semillas distintas → estado distinto cuando la sim consume el PRNG (o al menos `hash()` distinto por el estado PRNG); con el stub de movimiento una unidad llega a su meta en el nº esperado de ticks. Test de determinismo ampliado `packages/sim/test/determinism.test.ts` (placeholder de F0 se mantiene) con escenario de 50 unidades.

#### B4 — Repetición (0,5 d)

- **Dueño:** `sim-engineer`. **Depende de:** B3.
- **Hace:** `shared/replay.ts` (`validateReplay`, `serializeReplay`, `REPLAY_FORMAT_VERSION`), `sim/loop/replay-run.ts` (`runReplay`) (ADR-005 §9).
- **Criterio:** `packages/shared/test/replay.test.ts` + `packages/sim/test/replay.test.ts`: ida y vuelta `serializeReplay` → `JSON.parse` (en el test) → `validateReplay` idéntico; rechaza `turns` no ascendente, `cmd.turn != n`, `n >= totalTurns`, enteros no enteros, claves extra; `serializeReplay` byte-reproducible (mismo string con claves en otro orden de construcción); `runReplay` de una repetición grabada con la sim devuelve `ok` y mismos checkpoints; alterar un comando → `ok=false` y el primer checkpoint divergente identificado.

### Carril C — Rejilla, pathfinding, steering (`packages/sim`)

#### C1 — Rejilla, ocupación y hash espacial (0,75 d)

- **Dueño:** `sim-engineer (2º)`. **Depende de:** T0.
- **Hace:** `grid/{grid,map,spatial,index}.ts`: `createGrid`, `loadMap` (RLE), `isBlocked`, `setTerrain`, `occupyRect/releaseRect`, `version`, `sectorOf`, `nearestFree`, `createSpatialHash` (ADR-005 §10). `flush()` = no-op hasta C2.
- **Criterio:** `packages/sim/test/grid.test.ts`: RLE ida y vuelta (incluye mapas con tramos largos y `width*height` no múltiplo de 16); `isBlocked` true fuera del mapa; ocupar y liberar un edificio restaura `occ` y suma 2 a `version`; liberar edificio no desbloquea terreno; `nearestFree` coincide con una referencia de fuerza bruta (anillos Chebyshev, orden fila-mayor) en 10^4 casos aleatorios y devuelve `false` en mapa completamente bloqueado; el hash espacial devuelve vecinos en orden ascendente de ranura y coincide con búsqueda de fuerza bruta en 10^3 configuraciones.

#### C2 — Grafo de sectores y portales (1 d)

- **Dueño:** `sim-engineer (2º)`. **Depende de:** C1.
- **Hace:** `path/sectors.ts`: sectores 16×16, portales por tramos libres maximales en bordes, aristas intra-sector (A\* local acotado), reconstrucción incremental en `grid.flush()` para sectores sucios y vecinos, en orden ascendente.
- **Criterio:** `packages/sim/test/sectors.test.ts`: en mapas generados con PRNG semillado, conectividad del grafo de alto nivel == conectividad por inundación (flood fill) de nivel de casilla para 10^3 pares aleatorios; tras `occupyRect`/`releaseRect` el grafo reconstruido incrementalmente es **idéntico** (mismo hash de nodos y aristas) al reconstruido desde cero; mapas con tamaño no múltiplo de 16 y bordes de 1 casilla.

#### C3 — A\* de casillas + búsqueda jerárquica + suavizado (1 d)

- **Dueño:** `sim-engineer (2º)`. **Depende de:** C2.
- **Hace:** `path/{astar,hpa,queue,index}.ts`: `createPathfinder`, `findPath` con `PATH_OK/PARTIAL/NONE/TRUNCATED`, desempates deterministas, caché de alto nivel por `(sectorInicio, sectorMeta, grid.version)`, suavizado por visibilidad con DDA entera, cola FIFO de solicitudes (ADR-005 §10).
- **Criterio:** `packages/sim/test/path.test.ts`: en 500 mapas semillados, `PATH_OK` ⇔ alcanzable según flood fill; ninguna arista de la ruta atraviesa casilla bloqueada ni corta esquina; el costo octil de la ruta jerárquica ≤ 1,25 × el óptimo de A\* plano (documentar la holgura real medida); `PATH_PARTIAL` termina en la casilla alcanzable más cercana con el desempate especificado; resultado idéntico con y sin caché (`clearCaches`); misma consulta repetida → mismos waypoints byte a byte; `findPath` no asigna memoria (comprobación: `stats` y buffers reutilizados; benchmark de microconsulta sin crecimiento de heap en 10^4 consultas). Lint 0.

#### C4 — Steering local y colisiones (1 d)

- **Dueño:** `sim-engineer (2º)`. **Depende de:** C1, B1 (columnas del World), T0 (puede probarse con rutas inyectadas a mano, sin C3).
- **Hace:** `steer/steer.ts`: seguimiento de waypoints, separación con el hash espacial, deslizamiento contra casillas bloqueadas, detección de atasco (`stuck`), llegada (ADR-005 §10). Jacobi sobre `prevX/prevY`.
- **Criterio:** `packages/sim/test/steer.test.ts` con waypoints inyectados: invariante "ninguna unidad en casilla bloqueada" comprobado **en cada tick** en 10^4 ticks con 200 unidades; tras reposar 100 ticks no hay pares con solape > 50 % del menor radio; 100 unidades cruzando un pasillo de 3 casillas llegan (≥ 95 % con `groupArrive`) en ≤ T ticks (T fijado en el test y justificado); mismo resultado al procesar las unidades en orden inverso de índice en una variante de test (valida Jacobi: el `hashFull` es igual); sin asignaciones en el bucle (buffers preasignados).

#### C5 — Integración movimiento: cola de rutas + repath + llegada (0,75 d)

- **Dueño:** `sim-engineer (2º)`. **Depende de:** C3, C4, B3.
- **Hace:** `steer/index.ts` real (`createMovementSystem`): presupuesto `pathBudgetPerTick`, re-ruta al agotar waypoints (`PATH_TRUNCATED`, `repathAt`), `PATH_FOLLOW_PARTIAL`, `clearCaches`; reemplaza el stub de T0.
- **Criterio:** `packages/sim/test/movement.test.ts` sobre `createSim` real: 400 unidades dan la orden `move` a la otra mitad del mapa con obstáculos y llegan (≥ 95 % `orderKind=NONE` en ≤ N ticks, N documentado); meta inalcanzable → unidades terminan en la casilla alcanzable más cercana; test de transparencia de cachés (`clearCaches` a mitad de partida no cambia `hashFull` final); ningún tick supera el presupuesto de rutas; test de regresión de determinismo (dos ejecuciones, mismo `hashFull`) con 1000 unidades × 1000 ticks.

### Carril D — Runner headless, escenarios, bench (`tools/headless`)

#### D1 — Runner de repeticiones (0,75 d)

- **Dueño:** `qa-engineer`. **Depende de:** B4 (puede arrancar con B4 + stub de movimiento; la integración final espera C5).
- **Hace:** `tools/headless/src/{cli,replay-io,index}.ts`: `headless run <replay.json>` (valida, carga `buildSimData(loadGameData())`, comprueba `dataVersion`, ejecuta `runReplay`, imprime `finalHash` y checkpoints, **exit 0** si coincide con el `finalHash` del archivo, **1** si difiere, **2** error de formato); `headless record` para guardar una repetición desde un escenario; script `pnpm --filter @reinos/headless run` y `pnpm headless <cmd>` en la raíz.
- **Criterio:** `tools/headless/test/cli.test.ts`: repetición válida → exit 0; `finalHash` manipulado → exit 1 con el primer checkpoint divergente; JSON corrupto/enteros no enteros → exit 2; `dataVersion` incompatible → mensaje claro y exit 2; la salida es estable (mismo texto en dos corridas).

#### D2 — Escenario de 1000 unidades × 10 000 ticks (0,75 d)

- **Dueño:** `qa-engineer`. **Depende de:** D1, C5.
- **Hace:** `tools/headless/src/scenario.ts`: generador **determinista** (PRNG propio semillado, fuera de la sim) de mapa 200×200 con 20–30 % de obstáculos agrupados, 2 jugadores × 500 unidades, comandos `move`/`stop` en turnos repartidos sobre 2500 turnos (10 000 ticks) con subgrupos de ≤ 100 unidades por comando; `headless record --scenario thousand --seed N` produce la `Replay` con `finalHash` y checkpoints cada 100 turnos; escenarios adicionales: `small` (50 unidades, 500 ticks) y `corridor` (cuello de botella) para tests rápidos.
- **Criterio:** `headless run` del escenario `thousand` termina con exit 0; ≥ 3 semillas distintas producen hashes distintos y cada una es reproducible (dos corridas iguales); el escenario ejerce de verdad el movimiento (métrica en la salida: ≥ 80 % de las unidades cambian de casilla; `stats` del pathfinder con `queries > 0` y `cacheHits > 0`; ≥ 1 comando con meta inalcanzable); duración total de la corrida de 10 000 ticks registrada (informativa).

#### D3 — Bench (0,75 d)

- **Dueño:** `qa-engineer`. **Depende de:** D1, C5.
- **Hace:** `tools/headless/src/bench.ts`: `headless bench [--units 100,400,1000,1200] [--turns 500]`; calentamiento 200 ticks descartados; mide con `performance.now()` (permitido: está fuera de `packages/sim`) el tiempo de cada turno (incluye comandos y hash) y reporta por tick = turno / 4: media, p50, p95, p99, máx; registra versión de Node, CPU (`os.cpus()[0].model`), nº de núcleos; salida JSON + tabla Markdown (`docs/progress/fase-01/bench.md`).
- **Criterio (K2):** con 400 unidades, todas con orden de movimiento activa durante la medición, **p95 ≤ 3 ms por tick** y media ≤ 3 ms; objetivo de referencia GDD (informativo, no criterio de F1): 1200 unidades ≤ 8 ms. El archivo `bench.md` incluye el comando exacto y la máquina; si no se cumple, no se cierra la fase y se abre tarea de optimización (perfilado con `--cpu-prof`), **no** se relaja el criterio sin ADR.

#### D4 — Hashes dorados y `test:det` (0,5 d)

- **Dueño:** `qa-engineer`. **Depende de:** D2.
- **Hace:** `tools/headless/golden/hashes.json` (`{escenario: {seed, finalHash, checkpoints}}`) y `packages/sim/test/determinism.test.ts` que carga el escenario `thousand` (generado por `tools/headless` o fixture mínima comprimida si se evita dependencia circular: el test importa el generador desde `tools/headless` por ruta relativa solo en tests) y compara con el dorado; `pnpm test:det` ejecuta además el escenario completo de 10 000 ticks en Node.
- **Criterio:** `pnpm test:det` verde en Node con el hash dorado (K1, entorno Node); cambiar un solo bit de un comando o de una tabla de `trig-tables.ts` hace fallar el test (mutación manual documentada en el PR); el dorado fue calculado y verificado **dos veces** en procesos distintos (`node` normal y `node --jitless`) con el mismo resultado.

### Carril E — Determinismo multi-entorno

#### E1 — Determinismo Node vs Chromium (1 d)

- **Dueño:** `qa-engineer`. **Depende de:** D2.
- **Hace:** `tools/headless/browser/entry.ts` empaquetado con esbuild (IIFE, expone `window.ReinosSim.run(replay, simData)` y `runInWorker`); `e2e/determinism.spec.ts` (Playwright): Node genera la repetición `thousand` y el `SimData` (JSON plano), la página (`page.setContent` + `addScriptTag`) ejecuta `runReplay` y devuelve `{finalHash, checkpoints}`; segundo caso en un Web Worker (Blob); la spec compara con el dorado y con Node; script `pnpm test:det:browsers`.
- **Criterio:** en este entorno (Chromium preinstalado vía `CHROMIUM_PATH` / `/opt/pw-browsers/chromium`, `--no-sandbox`) `pnpm test:det:browsers` verde: `finalHash` y todos los checkpoints idénticos a Node en hilo principal y en Worker; caso extra con `--js-flags=--jitless`; tiempo total ≤ 5 min. Evidencia en `docs/progress/fase-01/determinism.md`.

#### E2 — Firefox y WebKit en CI (0,5 d)

- **Dueño:** `qa-engineer`. **Depende de:** E1.
- **Hace:** `playwright.det.config.ts` con proyectos `chromium` (como hoy: ejecutable preinstalado si existe), `firefox` y `webkit` **solo si `PW_ALL_BROWSERS=1`**; job en `.github/workflows/ci.yml` (`test-det-browsers`) con `npx playwright install --with-deps chromium firefox webkit` y `PW_ALL_BROWSERS=1`; el job falla con diff de hashes legible.
- **Criterio:** el YAML y la config pasan `pnpm lint`/`prettier --check`; `PW_ALL_BROWSERS` sin definir mantiene solo Chromium (verificado localmente, sin intentar descargar nada); documentado en `e2e/README.md` que Firefox/WebKit **no se pueden correr aquí**. La corrida en GitHub queda como TODO-HUMANO en STATUS (push/merge a `main`).

#### E3 — Informe de determinismo (0,25 d)

- **Dueño:** `qa-engineer`. **Depende de:** E1, E2.
- **Criterio:** `docs/progress/fase-01/determinism.md` con tabla (entorno, versión, resultado `finalHash`, ¿ejecutado aquí o en CI?), comando exacto para reproducir y estado honesto de K1 (Node, Chromium, Chromium-Worker, jitless: verificados; Firefox, WebKit: pendientes de CI).

### Carril F — Visualización y devlog

#### F1 — Visualización debug en canvas 2D (1 d)

- **Dueño:** `devlog-reporter` (con apoyo de `qa-engineer` para la API del runner). **Depende de:** D3 (y C5). Reutiliza el patrón de captura con Playwright de `tools/devlog`.
- **Hace:** `tools/headless/debug/{index.html,draw.ts}`: canvas 2D que dibuja mapa (obstáculos), cuadrícula de sectores 16×16, unidades como puntos por jugador, ruta (waypoints) de unidades seleccionadas y número de tick; recibe snapshots (`world` columnas) del bundle de `entry.ts` ejecutando un escenario corto (`corridor` y un tramo de `thousand`); `headless capture` genera fotogramas con Playwright (Chromium) y los ensambla en `docs/progress/fase-01/media/f1-debug.gif` (≤ 8 MB; encoder JS como `gifenc` o `ffmpeg` si existe).
- **Criterio:** `docs/progress/fase-01/media/f1-debug.gif` existe, ≥ 60 fotogramas, muestra obstáculos, unidades y al menos una ruta rodeando un obstáculo (revisión visual por `reviewer` con captura citada); el comando `pnpm headless capture` lo regenera sin intervención; tamaño dentro del límite.

#### F2 — Tabla de benchmark y entrada de devlog (0,5 d)

- **Dueño:** `devlog-reporter`. **Depende de:** D3, F1.
- **Hace:** `docs/progress/fase-01/devlog.json` (formato de `fase-00/devlog.json`) con entrada F1: GIF de F1, tabla de benchmark (100/400/1000/1200 unidades: media/p95/máx por tick), hash final de los entornos verificados, enlaces a `determinism.md`; `pnpm devlog` lo compila.
- **Criterio:** `pnpm devlog` termina con exit 0 y la entrada F1 muestra el GIF y la tabla; los números de la tabla coinciden con `bench.md` (verificación manual citada); entorno y fecha de la medición visibles en la entrada.

### R2 y Z — Cierre

#### R2 — Revisión adversarial (0,5 d)

- **Dueño:** `reviewer`. **Depende de:** D4, E3, F2.
- **Criterio:** informe en `docs/progress/fase-01/review.md`: busca fuentes de no-determinismo no cubiertas (iteración de `Map`/`Set`, `Object.keys` sobre claves numéricas, `sort` sin comparador, dependencia de orden de `unitIds`, uso de `Number` no entero, desbordes de 2^53 y `Math.imul`); intenta romper el test de transparencia de cachés y el de Jacobi; revisa que `lint:sim` no tenga excepciones `lint-sim-allow` injustificadas; bloqueantes corregidos y re-verificados.

#### Z — Cierre de fase (0,5 d)

- **Dueño:** orquestador / `architect`. **Depende de:** R2.
- **Hace:** correr `/verificar`; confirmar K1–K3 con evidencia enlazada; actualizar `STATUS.md` (K1 con 2/4 entornos pendientes de CI como TODO-HUMANO si no se corrió en GitHub); actualizar `docs/contracts.md` (exports de `shared` y `sim`; añadir dependencia `@reinos/data` solo si cambia, en F1 no); ADR-005 a "Aceptado"; tag `fase-01`.
- **Criterio:** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:det && pnpm data:check && pnpm build` verdes en un solo run; `pnpm test:det:browsers` verde en Chromium; ninguna tarea marcada hecha sin evidencia citada.

## 4. Tabla resumen

| Tarea | Dueño                 | Días | Depende de | Criterio principal                                                |
| ----- | --------------------- | ---- | ---------- | ----------------------------------------------------------------- |
| T0    | sim-engineer (2º)     | 0,5  | ADR-005    | typecheck/lint/data:check verdes; `buildSimData` válido           |
| A1    | sim-engineer          | 0,5  | T0         | `isqrt`/`fxMul`/`fxDiv` exactos vs `BigInt`                       |
| A2    | sim-engineer          | 0,5  | A1         | tablas con hash pineado; error ≤ 1 en sin/cos/atan2               |
| B1    | sim-engineer          | 0,75 | T0         | World determinista, hash dorado independiente                     |
| B2    | sim-engineer          | 0,75 | B1         | comandos: tabla de casos + fuzz; orden-invariante                 |
| R1    | architect             | 0,25 | B2         | veredicto; ADR-005 aceptado                                       |
| B3    | sim-engineer          | 0,75 | R1         | `step` ≡ 4×`stepTick`; hash por turno                             |
| B4    | sim-engineer          | 0,5  | B3         | `validateReplay`/`runReplay`, detección de divergencia            |
| C1    | sim-engineer (2º)     | 0,75 | T0         | rejilla + `nearestFree` vs fuerza bruta                           |
| C2    | sim-engineer (2º)     | 1    | C1         | grafo incremental == grafo desde cero; conectividad == flood fill |
| C3    | sim-engineer (2º)     | 1    | C2         | ruta OK ⇔ alcanzable; ≤ 1,25× óptimo; caché transparente          |
| C4    | sim-engineer (2º)     | 1    | C1, B1     | sin casillas bloqueadas; Jacobi; llegada en pasillo               |
| C5    | sim-engineer (2º)     | 0,75 | C3, C4, B3 | 400 unidades llegan; `clearCaches` transparente                   |
| D1    | qa-engineer           | 0,75 | B4         | `headless run` exit 0/1/2                                         |
| D2    | qa-engineer           | 0,75 | D1, C5     | escenario 1000×10 000 reproducible, ejerce movimiento             |
| D3    | qa-engineer           | 0,75 | D1, C5     | p95 ≤ 3 ms/tick con 400 unidades (K2)                             |
| D4    | qa-engineer           | 0,5  | D2         | `pnpm test:det` con hash dorado (K1-Node)                         |
| E1    | qa-engineer           | 1    | D2         | Node = Chromium (hilo y Worker)                                   |
| E2    | qa-engineer           | 0,5  | E1         | Firefox/WebKit en CI (no ejecutables aquí)                        |
| E3    | qa-engineer           | 0,25 | E1, E2     | `determinism.md` honesto                                          |
| F1    | devlog-reporter       | 1    | D3, C5     | GIF de debug ≥ 60 fotogramas                                      |
| F2    | devlog-reporter       | 0,5  | D3, F1     | `pnpm devlog` con GIF + tabla                                     |
| R2    | reviewer              | 0,5  | D4, E3, F2 | informe sin bloqueantes abiertos                                  |
| Z     | orquestador/architect | 0,5  | R2         | K1–K3 con evidencia; STATUS y ADR                                 |

Ruta crítica: T0 → B1 → B2 → R1 → B3 → B4 → D1 → D2 → D4 → E1 → E3 → R2 → Z (≈ 8,5 d-agente); el carril C (T0 → C1 → C2 → C3 → C5, ≈ 4,5 d) corre en paralelo y debe estar listo antes de D2/D3.

## 5. Riesgos y mitigaciones

| Riesgo                                        | Mitigación                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B y C chocan en `steer/` o `loop/`            | Propiedad por carpeta (ADR-005 §11), stub de T0 y `MovementSystem` como único punto de unión                                                            |
| Desbordes en productos de punto fijo          | Rangos documentados, tests contra `BigInt`, `FX_MAX_OPERAND`                                                                                            |
| Tick > 3 ms con 400 unidades                  | Presupuesto de rutas por tick, caché jerárquica, buffers preasignados, perfilado temprano en D3 (correr bench incluso con B/C parciales al terminar C5) |
| Desync por caché o por orden de procesamiento | Tests de transparencia de cachés y de Jacobi; `hashFull` con waypoints                                                                                  |
| Firefox/WebKit no verificables aquí           | Configurados en CI; K1 queda "pendiente de CI" explícito; no se declara cerrado antes                                                                   |
| `lint:sim` bloquea `/` fuera de `fixed.ts`    | `Math.trunc(a / b)` o desplazamientos; excepciones solo con `lint-sim-allow` justificado y revisado en R2                                               |
| Cambios de balance alteran hashes dorados     | Los dorados dependen de `DATA_VERSION`; bump de versión exige re-pinear y registrar en PR                                                               |

## 6. Fuera de alcance de F1

Flow fields por sector, formaciones y movimiento de grupo a la velocidad del más lento, cola con Shift, patrulla/seguir, combate, recolección, producción, objetivos `entity`, Web Worker de producción (F2), red/relay (F8). El layout del ECS y los comandos se amplían por enmienda de ADR-005.
