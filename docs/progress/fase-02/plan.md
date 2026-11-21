# Fase 2 — Plan de tareas: render isométrico base

Fuente: `docs/PLAN.md` Fase 2, GDD §11.3, §13.2–13.3, §15.2, §15.4, §17.1, **ADR-006** (contrato exacto entre carriles; propuesto), ADR-005 (aceptado), ADR-004 (COOP/COEP), `docs/contracts.md`, `docs/progress/fase-01/review-r1.md`. Autor: `architect`. Estado: planificada, sin tareas iniciadas.

**Objetivo:** ver y controlar la simulación en el navegador con PixiJS: terreno isométrico, unidades interpoladas a 60 fps, niebla, minimapa, selección y órdenes.

## 1. Criterios de fase (del PLAN) y evidencia

| #   | Criterio (PLAN)                                  | Evidencia / comando                                                                                                                                                                                                  | Estado de evidencia esperable                                                                                       | Tareas             |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| K1  | 400 unidades a ≥ 60 fps en el hardware de referencia | **Proxy documentado** (ADR-006 §10.2): `pnpm perf:render` → `docs/progress/fase-02/media/perf.md`+`perf.json` (updateMs p95 ≤ 4 ms, draw calls ≤ 60, tickMs p95 ≤ 3 ms, FPS software informativo + gate relativo). **Hardware real: TODO-HUMANO** | Proxy verde = "parcial". El criterio **no** se marca cumplido hasta medir en hardware real (STATUS: puerta humana). | Q2, R2–R3, W2      |
| K2  | Selección y movimiento sin lag perceptible       | `pnpm e2e:render` (`select-move.spec.ts`): `inputToMarkerMs` ≤ 1 frame (≤ 20 ms en p95); orden→primer movimiento ≤ 5 ticks (`worker/host.test.ts` + e2e); sin pérdida de frames de interpolación (`ticksDropped = 0`) | Verificable en este entorno (Chromium + SwiftShader).                                                               | U2–U3, W2, Q4      |
| K3  | Niebla correcta                                  | `visionGrid.test.ts` (incremental ≡ recomputación, discos, unión aliados) + `fog.spec.ts` (los 3 estados: píxel de tile inexplorado ≈ negro, explorado oscurecido, visible = terreno; enemigos ocultos fuera de visión) + captura        | Verificable.                                                                                                        | R5–R7, Q3          |
| K4  | Sin bordes de tile visibles                      | `terrain.spec.ts`: captura a 3 zooms + métrica de costuras `ratio ≤ 1,15` (ADR-006 §4.6) + revisión visual `reviewer`; test de tileabilidad de texturas                                                                  | Verificable (métrica operativa + revisión visual).                                                                  | R2, A1, Q3         |
| K5  | Interpolación a 60 fps y sim a 20 Hz             | `worker/host.test.ts` (20 ticks/s con reloj falso), `determinism-worker.spec.ts` (hash por turno del Worker == Node), medición de `alpha` en e2e                                                                       | Verificable.                                                                                                        | W2, R3             |
| K6  | Devlog: capturas del mapa isométrico y GIF de selección y movimiento de 100 unidades | `docs/progress/fase-02/media/{iso-z0.6,iso-z1,iso-z1.4,fog,minimap}.png`, `select-move-100.gif`, entrada de devlog (`pnpm devlog`) | Verificable.                                                                                                        | Q4, F1             |
| K7  | Higiene de fase                                  | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:det` (golden **sin cambios**: `0x9f6e57a6`), `pnpm build` (≤ presupuesto de descarga), `ASSETS_LICENSES.md` completo, `STATUS.md` actualizado                  | Verificable.                                                                                                        | todas, R2'         |

**Criterio de honestidad sobre el hardware.** Aquí no hay GPU: Chromium headless usa SwiftShader. El FPS en software **no equivale** al de una iGPU Iris Xe/680M (ADR-006 §10.1). Se reporta tal cual; K1 queda "proxy verde + TODO-HUMANO" hasta medición real. No se baja el criterio ni se cierra la fase con K1 en rojo por proxy (si el proxy falla, se arregla).

## 2. Mapa de dependencias

```
T0 (andamiaje + stubs de contrato) ─┬─> W1 ─> W2 ─> W3 ──────────────────────────────┐
                                    ├─> R1 ─┬─> R2 ─┐                                 │
                                    │       ├─> R3 ─┼─> I1 (integración) ─> Q4 ─> F1 ─> R-final ─> Z
                                    │       └─> R5 ─> R6 ─> R7                        │
                                    ├─> U1 ─> U2 ─> U3 ─> U4 ──────────────────────────┤
                                    ├─> A1 ─> A2 ─> A3                                 │
                                    └─> Q1 ─> Q2, Q3                                   │
D1 (data: camera/selection) ─> U1, U2        S1, S2, S3 (hardening sim, paralelas)  ───┘
```

Paralelismo: tras T0 + D1, **cinco carriles independientes** — W (worker), R (render), U (entrada/UI), A (assets), Q (arnés de pruebas) — que se acoplan solo por los contratos de ADR-006 (stubs en T0). Convergen en **I1** (integración en `main.ts`) y **Q4**. Los carriles S (hardening de F1) son independientes del render.

Reglas de merge: una rama `fase-02/<tarea>` por tarea; `pnpm typecheck && pnpm test && pnpm lint` verdes (y `pnpm test:det` si se tocó `shared`/`sim`/`data`); ninguna tarea edita carpetas de otro carril (propiedad en ADR-006 §11); cambios de contrato solo por enmienda de ADR-006.

## 3. Tareas

Dueños: `architect`, `render-engineer` (R), `render-engineer (2º)` (R'), `sim-engineer` (W, S1), `sim-engineer (2º)` (S2–S3), `ui-engineer` (U), `art-pipeline` (A), `qa-engineer` (Q), `content-designer` (D1), `devlog-reporter` (F1), `reviewer` (R-final). Estimación en días-agente (≤ 1).

### T0 — Andamiaje del cliente y stubs de contrato (0,75 d)

- **Dueño:** `render-engineer`, supervisa `architect`. **Depende de:** ADR-006 propuesto.
- **Hace:**
  - Dependencias (ADR-006 §2.1): `pixi.js@8`, `react@19`, `react-dom@19`, `zustand@5`, `@vitejs/plugin-react` (verificar peer con Vite 8), tipos React, `@reinos/{sim,shared,data}` como `workspace:*`; `pngjs` y `gifenc` (dev). Registrar versiones resueltas en el devlog.
  - `tsconfig` (`jsx: react-jsx`), `vite.config.ts` (plugin React, `worker.format = 'es'`, cabeceras COOP/COEP en `server` y `preview`), `vitest.config.ts` del cliente (entorno `node`), ESLint con `no-restricted-imports` por carpeta (tabla de ADR-006 §2).
  - Estructura de carpetas completa con archivos vacíos/stub: `worker/{protocol,snapshot,host,client}.ts` con **tipos y firmas exactas** de ADR-006 §3; `render/{constants,iso,camera,culling,depth}.ts` con firmas; `render/fog/visionGrid.ts` con la clase y métodos (cuerpos `throw new Error('TODO')`); `ui/store.ts` con la interfaz `GameView`; `assets/manifest.ts` con el esquema Zod.
  - Scripts raíz: `e2e:render`, `perf:render`, `assets:gen` (placeholders que fallan con mensaje claro hasta Q1/Q2/A1).
  - Smoke temprano: página mínima que crea `Application` Pixi (WebGL) y dibuja un `Mesh` con un shader trivial; verificarla **bajo SwiftShader** (reduce el riesgo nº 1 de ADR-006).
- **Criterio verificable:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes; `pnpm --filter @reinos/client build` produce el bundle con un chunk de worker separado; el smoke Pixi bajo Chromium headless con los flags de SwiftShader imprime `WEBGL2 OK` y una captura no vacía; el test de dependencias falla si `render/` importa `@reinos/sim`.

### D1 — Datos de cámara y selección (0,25 d)

- **Dueño:** `content-designer`. **Depende de:** T0 (paralelo). **Hace:** bloques `camera` (`panSpeedPxPerS`, `edgeBandPx`, `edgeDelayMs`, `zoomTauMs`) y `selection` (`maxUnits: 200`) en `packages/data/json/game.json` + Zod `strict` en `schemas/game.ts`; `DATA_VERSION` → `0.2.1`; sin cambios en `SimData` ni en el hash de sim.
- **Criterio:** `pnpm data:check` verde; test en `packages/data` valida tipos/rangos (enteros positivos, `maxUnits ≤ 1024`); `pnpm test:det` mantiene el golden `0x9f6e57a6`.

### Carril W — Worker de simulación

#### W1 — Layout de snapshot y transportes (0,75 d)

- **Dueño:** `sim-engineer`. **Depende de:** T0.
- **Hace:** `snapshotLayout(capacity)`, `SnapshotWriter` (copia columnas de `World` con `subarray().set`, compone `flags`), `SnapshotReader`/`SnapshotView`; transporte `transfer` (pool de 3 buffers + reciclado) y `sab` (triple buffer con `Atomics`, ADR-006 §3.3–3.4) tras la misma interfaz `SnapshotSource`.
- **Criterio:** `packages/client/test/worker/snapshot.test.ts`: round trip bit a bit contra un `World` real (de `createSim`) en ambos modos; sin solapes de offsets; test de entrelazado exhaustivo escritor/lector (todas las secuencias de pasos para 3 ranuras) que nunca devuelve una ranura en escritura; 0 asignaciones en régimen estacionario (contador de `new ArrayBuffer`); `pnpm typecheck` verde.

#### W2 — `SimHost`, Worker y `SimClient` (1 d)

- **Dueño:** `sim-engineer`. **Depende de:** W1.
- **Hace:** `protocol.ts` final; `SimHost` (pacing 20 Hz con reloj inyectado, lote ≤ 4 ticks, descarte > 10 ticks, `CommandScheduler` con reescritura de `turn`, mensaje `turn` con hash, `perf` cada 1 s); `sim.worker.ts`; `SimClient` (`start`, `latest`, `latestArrivalMs`, `send`, `control`, `onTurn`, `dispose`); selección automática de modo según `crossOriginIsolated` y `?snap=`.
- **Criterio:** `worker/host.test.ts` (Node, reloj falso): 20 ticks/s a `speed=1`; comandos entregados solo cuando `tick % 4 === 0` con `turn` reescrito; orden→primer cambio de `pos` ≤ 5 ticks; el hash por turno coincide con el de `createSim`+`step` del mismo escenario y semilla; comandos mal formados descartados sin excepción; pausa/`step` correctos. Prueba manual documentada: el Worker arranca en Chromium y publica snapshots (`__reinos.tick` crece a ≈ 20/s).

#### W3 — Escenarios de demo y de carga (0,5 d)

- **Dueño:** `sim-engineer`. **Depende de:** W2.
- **Hace:** `worker/scenarios.ts`: `demo100` y `demo400` (mapa 128×128 con lagos/bosques bloqueados vía `blockedRle`, 2 jugadores, unidades repartidas en cuadrícula; `spawns` en orden determinista), expuestos por nombre para `__reinos.loadScenario`. Sin números de balance (solo geometría del escenario).
- **Criterio:** test: ambos escenarios pasan `validateSimConfig`; `createSim` los acepta; el hash tras 200 ticks es estable (valor pineado en el test) en Node.

### Carril R — Render

#### R1 — Proyección, cámara, culling y profundidad puros (0,75 d)

- **Dueño:** `render-engineer`. **Depende de:** T0.
- **Hace:** `iso.ts`, `camera.ts`, `culling.ts`, `depth.ts`, `constants.ts` (ADR-006 §4.1–4.4), incluido `interpolatedPos` y `ellipseForRadius`.
- **Criterio:** `render/iso.test.ts`, `culling.test.ts`, `depth.test.ts` (tabla ADR-006 §10.3) verdes: ida y vuelta de proyección en 10⁴ casos, 2:1 exacto, `visibleTileRange` ⊇ fuerza bruta en 10⁴ cámaras, orden de profundidad estable; los módulos no importan Pixi (test de dependencias).

#### R2 — Aplicación Pixi, terreno por chunks y splatting (1 d)

- **Dueño:** `render-engineer`. **Depende de:** R1, A1 (texturas; hasta entonces texturas de relleno de T0).
- **Hace:** `Renderer` (capas, bucle, `resize`, `stats`), `TerrainMap` + `terrainGen` (ruido sembrado), textura de pesos `(W+1)×(H+1)`, shader de splatting (ADR-006 §4.6), una malla por chunk con culling.
- **Criterio:** captura del terreno a los 3 zooms sin costuras visibles; `terrain.spec.ts` (con Q3) `ratio ≤ 1,15`; `stats.drawCalls` ≤ chunks visibles + 3; mapa 128×128 a 1280×720 con `updateMs` < 1 ms de CPU de terreno por frame.

#### R3 — Capa de unidades: sprites, interpolación, profundidad, culling (1 d)

- **Dueño:** `render-engineer`. **Depende de:** R1, W1 (layout/lector), A2 (atlas; antes, rectángulos de color de T0).
- **Hace:** `unitLayer.ts` (pool por ranura, par `body`/`team`, dirección y animación, interpolación `prev→pos` con `alpha`, salto > 4 tiles sin interpolar, `zIndex = depthKey`, culling previo al toque del sprite), anillos de selección y `markers.ts` (pool de 8, 600 ms).
- **Criterio:** captura con 400 unidades; `__reinos.metrics.updateMs` p95 ≤ 4 ms con 400 unidades visibles (medido en Chromium); con la cámara fuera de la masa `visibleUnits` baja proporcionalmente (culling efectivo); 0 asignaciones por frame en estado estacionario (sondeo de heap en el test e2e, tolerancia documentada); orden de profundidad correcto en una captura de prueba con unidades solapadas.

#### R5 — `VisionGrid` con conteo de referencias (0,75 d)

- **Dueño:** `render-engineer (2º)`. **Depende de:** T0, W1 (tipo `SnapshotView`).
- **Hace:** `visionGrid.ts` puro, solo enteros (ADR-006 §7.2): discos por radio precomputados con `isqrt` de `shared`, delta incremental, `explored` monótono, `viewFor(playerMask)` con unión de aliados. Sin Pixi ni DOM.
- **Criterio:** `render/fog/visionGrid.test.ts` verde (tamaños de disco, simetría suma/resta, exploración monótona, aliados, incremental ≡ recomputación completa en 1000 pasos con semilla, 400 unidades `update` ≤ 1 ms en Node); `pnpm lint:sim` **también** pasa sobre este archivo cuando se ejecuta con la regla de ruta extendida (se añade `render/fog/visionGrid.ts` a la lista opcional de `lint-sim` para blindar su portabilidad a la sim en F4).

#### R6 — Textura de niebla, shader de desenfoque y ocultación de enemigos (0,75 d)

- **Dueño:** `render-engineer (2º)`. **Depende de:** R2, R5.
- **Hace:** `fogRenderer.ts` (textura R8, fundido en CPU solo de texels cambiados, malla overlay, shader de 9 muestras), ocultación de sprites enemigos/neutrales en tiles no visibles, `setLocalPlayer`.
- **Criterio:** captura con los 3 estados; `__reinos.fogState(tx,ty)` coincide con el píxel renderizado (Q3); subida de textura solo si hubo cambios (contador `fogUploads` < 20/s con 400 unidades en movimiento).

#### R7 — Minimapa (0,75 d)

- **Dueño:** `render-engineer (2º)`. **Depende de:** R5, A1 (colores de capa), U4 (host DOM).
- **Hace:** `minimap.ts` Canvas2D 10 Hz, terreno pre-rasterizado, puntos, niebla, cuadrilátero de cámara; `mapping.ts` (minimapa↔rejilla) y navegación por clic/arrastre.
- **Criterio:** `render/minimap/mapping.test.ts` (ida y vuelta, bordes); captura del minimapa con niebla y cámara; e2e: clic en una esquina del minimapa centra la cámara en la esquina correspondiente (± 1 tile).

### Carril U — Entrada y UI

#### U1 — Router de entrada y controlador de cámara (0,75 d)

- **Dueño:** `ui-engineer`. **Depende de:** T0, D1, R1.
- **Hace:** `pointerRouter.ts` (estados idle/box/pan/minimapDrag), `cameraController.ts` (flechas, borde con retardo, botón central, rueda = 3 zooms anclados al cursor), `keymap.ts` (tabla de atajos de GDD §13.3).
- **Criterio:** tests con eventos sintéticos y reloj falso (los atajos mueven la cámara a la velocidad de `game.json`, el zoom recorre 0,6→1→1,4 y se detiene en extremos, el borde no dispara antes de `edgeDelayMs`); e2e: rueda y flechas cambian `__reinos.camera`.

#### U2 — Picking y selección con caja (0,75 d)

- **Dueño:** `ui-engineer`. **Depende de:** U1, R1, W1.
- **Hace:** `picking.ts`, `selection.ts` (ADR-006 §5): clic, caja, Shift, doble clic/Ctrl por tipo en pantalla, tope `selection.maxUnits`, respeto de niebla.
- **Criterio:** `input/picking.test.ts` verde (más al frente gana; enemigas en niebla no se pican; caja solo propias; umbral 4 px; tope); e2e: caja sobre 100 unidades → `selection.count === 100` en el store.

#### U3 — Órdenes, marcador y grupos de control (0,75 d)

- **Dueño:** `ui-engineer`. **Depende de:** U2, W2, R3 (marcador).
- **Hace:** `orders.ts` (clic derecho → `Command` `move` de `shared`, partición en 1024, `S` = `stop`), disparo inmediato del marcador, `controlGroups.ts` (Ctrl+0–9 crea, 0–9 selecciona filtrando muertos, doble pulsación centra), clic derecho en minimapa.
- **Criterio:** `input/orders.test.ts` verde (`validateCommandShape` OK, `turn: 0`, `unitIds` ascendentes, objetivo acotado); e2e: tras clic derecho, `inputToMarkerMs` ≤ 1 frame y las 100 unidades llegan a ±3 tiles del objetivo; grupos: crear, destruir una unidad, recuperar sin la muerta; documentar el riesgo `Ctrl+1–8` en `docs/progress/fase-02/README.md`.

#### U4 — Capa React mínima y store a 10 Hz (0,75 d)

- **Dueño:** `ui-engineer`. **Depende de:** T0 (paralelo con U1–U3; usa stubs).
- **Hace:** `store.ts` (solo lectura), `bridge.ts` (10 Hz + publicación inmediata ante cambio de selección), `App.tsx`, `SelectionPanel` (hasta 60 iconos + "+N"), `DevOverlay` (FPS, tick, modo, renders/s), `MinimapHost`, textos en español.
- **Criterio:** `ui/store.test.ts` (sin setter exportado, 10 Hz con reloj falso); e2e: `reactRendersPerSec` ≤ 12 con 400 unidades en movimiento; con el overlay oculto el HUD no re-renderiza por frame.

### Carril A — Assets provisionales (procedurales)

#### A1 — Texturas de terreno y ruido procedurales (0,75 d)

- **Dueño:** `art-pipeline`. **Depende de:** T0.
- **Hace:** `tools/asset-pipeline/src/provisional/terrain.ts` (+ `png.ts` con `pngjs`): `ground0..3.png` 512×512 tileables, `noise.png` 256×256 tileable; `pnpm assets:gen`; filas en `ASSETS_LICENSES.md` ("Propio", herramienta = script, Fase 2).
- **Criterio:** `tools/asset-pipeline` test: dos ejecuciones producen PNG byte-idénticos; diferencia media entre bordes opuestos de cada textura < umbral (tileable); `ASSETS_LICENSES.md` lista cada archivo; revisión visual de una hoja de contacto (`media/terrain-sheet.png`).

#### A2 — Atlas procedural de unidades (1 d)

- **Dueño:** `art-pipeline`. **Depende de:** A1.
- **Hace:** `units.ts`: rasterizador propio (elipses, segmentos, antialiasing), 5 apariencias × 8 direcciones × (idle + walk×4) × {`body`, `team`} en marcos 64×96, sombra baked, `units.png`+`units.json` (formato spritesheet Pixi), `ui.png`+`ui.json`, `manifest.json` con `appearances` por `sprite` id de `units.json`; convención de dirección de ADR-006 §4.7.
- **Criterio:** test del manifest (Zod) y de existencia de todos los marcos; el marco `civil/body/0/idle0` apunta hacia abajo-derecha (+x de rejilla) comprobado por centroide de píxeles del indicador; hoja de contacto `media/units-sheet.png`; peso total de `public/assets/provisional` ≤ 3 MB.

#### A3 — Cargador de assets del cliente (0,5 d)

- **Dueño:** `art-pipeline` (con `render-engineer` para el consumo). **Depende de:** A2.
- **Hace:** `assets/loader.ts` (PIXI.Assets, mipmaps y `REPEAT` en terreno), validación del manifest al cargar, fallback a `generic`.
- **Criterio:** `assets/manifest.test.ts` verde; en el navegador no hay 404 ni errores de consola; `pnpm build` ≤ 8 MB hasta el menú (GDD §17.1).

### Carril Q — Arnés de pruebas y medición

#### Q1 — Playwright con SwiftShader y API `__reinos` (0,75 d)

- **Dueño:** `qa-engineer`. **Depende de:** T0.
- **Hace:** `playwright.render.config.ts` (Chromium preinstalado, flags de SwiftShader, `vite preview` con COOP/COEP, proyectos `sab` y `transfer`), `boot/debug.ts` (API de ADR-006 §10.4), `smoke.spec.ts`, helper de captura con cámara/escenario fijos, fallo del test ante errores de consola WebGL/Pixi; `e2e/README.md` actualizado.
- **Criterio:** `pnpm e2e:render` verde en este entorno con el smoke (WebGL2 activo, `ready`, `tick` crece a ≈ 20/s en ambos modos; en modo `sab` `crossOriginIsolated === true`); captura reproducible (dos corridas → imágenes idénticas en píxeles bajo el mismo binario).

#### Q2 — Proxy de rendimiento (0,75 d)

- **Dueño:** `qa-engineer`. **Depende de:** Q1, R3 (y W3).
- **Hace:** `perf.spec.ts` + `scripts/perf-report` (ADR-006 §10.2): escenario `demo400`, 3 zooms × 2 modos, contador de draw calls por *monkey patch* del contexto, `updateMs` (p50/p95/max), `tickMs`, FPS software, `perf-baseline.json`; escribe `docs/progress/fase-02/media/perf.md` y `perf.json` con la advertencia explícita de que **no es hardware de referencia**; página/overlay `__reinos.perfReport()` para la medición humana.
- **Criterio:** gates del proxy verdes (updateMs p95 ≤ 4 ms, draw calls ≤ 60, tickMs p95 ≤ 3 ms, `ticksDropped = 0`); informe generado con números reales; el TODO-HUMANO queda redactado en el informe (comando exacto y aceptación p5 ≥ 60 fps en Alta).

#### Q3 — Métrica de costuras y píxeles de niebla (0,5 d)

- **Dueño:** `qa-engineer`. **Depende de:** Q1, R2, R6.
- **Hace:** `terrain.spec.ts` (ratio de energía de gradiente en bordes de tile/chunk vs líneas desplazadas, 3 zooms) y `fog.spec.ts` (muestras de píxel en `screenOfTile`: inexplorado ≈ negro, explorado oscurecido, visible = terreno; enemigo oculto/visible según tile).
- **Criterio:** ambos specs verdes; capturas guardadas en `media/`; el spec falla si se desactiva el splatting (control negativo: terreno con tiles de textura independiente da `ratio > 1,15`).

#### Q4 — Escenario de 100 unidades y GIF del devlog (0,75 d)

- **Dueño:** `qa-engineer`. **Depende de:** I1, U3.
- **Hace:** `select-move.spec.ts` (caja sobre 100 unidades, clic derecho, llegada; mide `inputToMarkerMs`; captura frames a intervalos fijos), generación de `select-move-100.gif` con `gifenc` (o `ffmpeg` si existe), `determinism-worker.spec.ts` (hash por turno del Worker == Node para el mismo escenario y semilla).
- **Criterio:** specs verdes; GIF ≤ 8 MB con ≥ 3 s de movimiento visible; hashes iguales.

### S — Hardening heredado de F1 (paralelo, no bloquea el render)

#### S1 — `simDataHash` (R1/F1 H3) (0,75 d)

- **Dueño:** `sim-engineer (2º)`. **Hace:** `simDataHash(SimData)` en `shared` (FNV sobre todos los arrays en orden fijo), campo en `Replay` y comparación en `createSim`/`runReplay`; `REPLAY_FORMAT_VERSION` → 2; el worker lo informa en `ready`.
- **Criterio:** tests de `shared`/`sim` (cambiar un valor de `SimData` cambia el hash y `createSim` lo rechaza si difiere); **`pnpm test:det` con el mismo golden** (el estado no cambia); documentar en `docs/contracts.md`.

#### S2 — Test en navegador de `buildSimData` con empates .5 (R1/F1 H4) (0,5 d)

- **Dueño:** `sim-engineer (2º)`. **Depende de:** S1 (para comparar hash), Q1 (patrón de spec).
- **Hace:** caso en la spec de determinismo en navegador: `buildSimData` sobre `bundledRaw` y sobre una tabla sintética con empates `x.5`, comparar `simDataHash` contra Node en Chromium (Firefox/WebKit en CI); evaluar redondeo entero explícito si hay diferencia.
- **Criterio:** `pnpm test:det:browsers` verde en Chromium; evidencia en `docs/progress/fase-01/determinismo.md` (adenda).

#### S3 — Contador `skippedUnits` (R1/F1 M3, opcional) (0,25 d)

- **Dueño:** `sim-engineer (2º)`. **Hace:** contador de omisiones por unidad en `TurnResult` (fuera del hash) y su aparición en el mensaje `turn` del worker.
- **Criterio:** test unitario; golden sin cambios.

### I1 — Integración en `main.ts` (0,75 d)

- **Dueño:** `render-engineer`. **Depende de:** W2, R3, R6, U3, U4, A3.
- **Hace:** `main.ts` arranca `SimClient` → escenario → `Renderer` → `InputController` → React; parámetros `?scenario=demo100|demo400&snap=sab|transfer&debug=1&perf=400`; reemplaza la pantalla "en construcción" conservando el enlace al devlog; resuelve conflictos de merge.
- **Criterio:** `pnpm build && pnpm --filter @reinos/client preview` muestra el mapa isométrico con unidades que se mueven; `pnpm e2e:render` completo verde; `pnpm test:det` y `pnpm lint:sim` sin cambios de resultado.

### F1 — Devlog, STATUS y cierre (0,5 d)

- **Dueño:** `devlog-reporter`. **Depende de:** Q4, Q2.
- **Hace:** `docs/progress/fase-02/README.md` (resumen, tabla criterio→evidencia, riesgos), `devlog.json` con capturas (z0,6/z1/z1,4, niebla, minimapa) y `select-move-100.gif`; `pnpm devlog`; actualizar `STATUS.md` (criterios, **TODO-HUMANO de FPS en hardware real**, deuda); `docs/contracts.md` (cliente: contratos de worker/snapshot; nota de migración de la niebla a la sim en F4).
- **Criterio:** `pnpm devlog` genera la entrada con las 5 capturas y el GIF; `STATUS.md` no marca K1 como cerrado sin medición real.

### R-final — Revisión adversarial (0,5 d)

- **Dueño:** `reviewer` (con `architect` para diseño). **Depende de:** F1.
- **Hace:** `/revisar` del diff completo y de las capturas; contrasta con ADR-006 y GDD §15.4; revisa honestidad de K1, métricas de costuras, licencias y reglas de importación.
- **Criterio:** `docs/progress/fase-02/review-r1.md` sin bloqueantes abiertos; ADR-006 pasa a **Aceptado** (o enmendado) antes del cierre.

### Z — Cierre

`/verificar` completo; PR/merge a la rama de fase; `STATUS.md` con "Fase 2 cerrada" **solo** con K2–K7 en verde y K1 en "proxy verde + puerta humana".

## 4. Dependencias a agregar (resumen)

`pixi.js@^8`, `react@^19`, `react-dom@^19`, `zustand@^5`, `@vitejs/plugin-react` (compatible con Vite 8), `@types/react`, `@types/react-dom` (client); `@reinos/{sim,shared,data}` `workspace:*` (client); `pngjs` (`tools/asset-pipeline`, `e2e`), `gifenc` (`e2e`/devlog). Detalle y reglas en ADR-006 §2.1.

## 5. Estructura de carpetas (resumen)

`packages/client/src/{boot,worker,render,input,ui,assets}` (+ `render/{terrain,entities,fog,minimap}`), tests en `packages/client/test/**`, generadores en `tools/asset-pipeline/src/provisional/`, e2e en `e2e/render/`. Árbol y reglas de importación en ADR-006 §2.

## 6. Mapeo criterio → evidencia → tareas (vista corta)

| Criterio del PLAN                | Evidencia concreta                                                                                                          | Dónde queda                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 400 unidades ≥ 60 fps            | Proxy (`perf.json`): updateMs p95 ≤ 4 ms, draw calls ≤ 60, tickMs p95 ≤ 3 ms; **TODO-HUMANO**: JSON de hardware real (p5 ≥ 60 fps) | `media/perf.md`, `STATUS.md` (puerta humana)     |
| Selección/movimiento sin lag     | `inputToMarkerMs` ≤ 1 frame; orden→movimiento ≤ 5 ticks; GIF de 100 unidades                                               | `select-move.spec.ts`, `worker/host.test.ts`     |
| Niebla correcta                  | Tests de `VisionGrid` + píxeles de los 3 estados + captura                                                                  | `visionGrid.test.ts`, `fog.spec.ts`, `media/fog.png` |
| Sin bordes de tile visibles      | Métrica de costuras `ratio ≤ 1,15` en 3 zooms + control negativo + revisión visual                                          | `terrain.spec.ts`, `media/iso-z*.png`            |
| Devlog con capturas y GIF        | 5 capturas + `select-move-100.gif` + entrada de devlog                                                                      | `docs/progress/fase-02/`, `pnpm devlog`          |

## 7. Puertas humanas (TODO-HUMANO) de la fase

- Medición de FPS con 400 unidades en el portátil de referencia (Iris Xe/680M, Chrome) con el overlay/`perfReport()` (K1). Pegar el JSON en `STATUS.md`.
- Firefox/WebKit para el render: no disponibles aquí; el render se verifica solo en Chromium (límite anotado).
- (Heredadas) primera corrida de CI en GitHub; compra/aprobación de packs de arte (puerta de Fase 6, conviene iniciarla ya).

## 8. Riesgos de la fase

| #   | Riesgo                                                                          | Mitigación                                                                                         |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | SwiftShader no soporta algo que usa Pixi v8 o el shader                          | Smoke en T0; texturas POT; renderer WebGL2 explícito; flags documentados                           |
| 2   | `@vitejs/plugin-react` incompatible con Vite 8                                   | Verificar peer en T0; fijar versiones compatibles con ADR menor                                    |
| 3   | COEP `require-corp` rompe recursos externos                                      | Todo local; sin CDN/fuentes externas; probar `sab` y `transfer`                                    |
| 4   | Niebla en cliente diverge de la futura de sim                                    | Módulo puro y portable; migración obligatoria en F4 (requisito anotado)                            |
| 5   | `Ctrl+1–8` reservado por el navegador                                            | Tabla `keymap.ts` y alternativa `Alt+dígito`                                                       |
| 6   | Proxy de FPS interpretado como garantía                                          | Redacción explícita en informe y STATUS; K1 no se cierra sin hardware real                         |
| 7   | Conflictos entre carriles en `package.json`/lockfile                              | T0 fija todas las dependencias de golpe; el resto no toca `package.json` salvo A1 (`pngjs`) y Q1   |
