# Fase 3 — Plan de tareas: economía y construcción (Eras I–II)

Fuente: `docs/PLAN.md` Fase 3 y §6 (Hito 1), GDD §4, §5, §6, §7.1, §11, §13.2–13.3, §17.1–17.2, **ADR-007** (contrato exacto entre carriles; propuesto), ADR-005 y ADR-006 (aceptados), `docs/contracts.md`, `docs/progress/STATUS.md`, `packages/data` (units/buildings/economy/ages/techs ya transcritos). Autor: `architect`. Estado: planificada, sin tareas iniciadas. Fecha: 2026-11-21.

**Objetivo:** el bucle económico completo de las dos primeras eras sobre un mapa generado: colonos que caminan, recolectan 4 recursos y depositan; construyen (3t/(n+2)) y reparan; entrenan con colas y punto de reunión; suben a Era del Hierro; tecnologías económicas como modificadores; HUD económico. Hito 1 = sandbox jugable.

## 1. Alcance exacto (resumen; la tabla completa está en ADR-007 §1)

| Entra                                                                                                                               | Pendiente / oculto (con nota, no se implementa en F3)                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuentes: **ovejas, bayas, granjas (búfer y resiembra), tala, minería de éter, cantera, caza de ciervo**                             | **Jabalí** (atraerlo requiere combate/IA: F4/F5; se genera y cuenta para la equidad pero **no se materializa**). Pesca/trampas/Puerto/pesquero (naval, F7) |
| 9 edificios: Ciudadela, Casa, Molino, Aserradero, Campamento minero, Granja, Cuartel, Establo, Atalaya                              | Puerto, empalizadas, puertas, torres, murallas, Portón (F4–F7); Arquería, Forja, Mercado (hasta tener función); Eras III–IV                                |
| Entrenar: Colono, Recluta, Batidor (los combatientes se crean y mueven, **no pelean**)                                              | Resto de unidades (F4+)                                                                                                                                    |
| Eras I–II con requisitos, bloqueo de la Ciudadela y PV por era                                                                      | Armadura por era se guarda, no se usa (F4)                                                                                                                 |
| 6 tecnologías económicas de Eras I–II (Jubón, Carretilla, Hacha, Yugo, Picos de éter, Picos de piedra) como modificadores genéricos | Resto de tecnologías                                                                                                                                       |
| Comandos: gather, build, repair, train, set-rally, research, advance-age, cancel-queue, delete, reseed                              | **Guarnición/campana**: no se añade nada (F4). Mercado/tributo/comercio (F7). Fragmentos Coronales (F7)                                                    |
| Visión de edificios en el **cliente** (`VisionGrid`); regla "no construir en casillas inexploradas" solo en UI                      | Migración de visión a la sim (F4)                                                                                                                          |
| Golpe de caza mínimo contra ciervos (primitiva provisional)                                                                         | Sistema de daño real (F4)                                                                                                                                  |

Los elementos pendientes **no aparecen en el HUD** (se filtran por `game.json.scope`) y la sim los rechaza con motivo `not_enabled`.

## 2. Criterios de fase (PLAN) y evidencia

| #      | Criterio                                                                                                                             | Evidencia / comando                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Qué cuenta como cumplido                                                                                                                                     | Tareas                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **K1** | Test de calibración verde (bot de scouts: Era II ≈ 7:55–8:30 con 21 de población, ±15 s)                                             | `pnpm --filter @reinos/headless test calibration` → `docs/progress/fase-03/media/calibracion.md` (línea de tiempo del bot: ticks de cada hito, `popAtClick`, `clickTick`, llegada a Era II). Aserción 1: `clickTick ∈ [9200, 10500]` y `popAtClick == 21`; aserción 2: `clickTick == PINNED`                                                                                                                                                                                                                                                                                                                                                                           | Ambas aserciones verdes en CI. Interpretación fijada en ADR-007 §14 (clic de era). Si no entra solo con parámetros AMBIGUO ⇒ ADR, **no** se baja el criterio | D1, E*, G*, M*, Q2, Q3 |
| **K2** | Se puede jugar 15 minutos de economía sin errores                                                                                    | (a) `soak.test.ts` headless: 18 000 ticks (15 min) con el bot extendido (granjas, éter, piedra, tecnologías, 2º Ciudadela, 80+ colonos); invariantes **en cada turno**: stock ≥ 0, `popUsed ≤ popCap` (salvo reserva), 0 comandos del bot rechazados, `rebuildOccupancy` idéntica, conservación de recursos exacta, 0 colonos en `SEARCH` > 100 ticks, sin excepciones, mismo `hashFull` en 2 corridas y con `clearCaches`. (b) `e2e/render/economy.spec.ts` (Chromium+SwiftShader): flujo por HUD real (colocar Casa/Molino/Aserradero, entrenar, recolectar, subir de era) con **0 errores de consola** durante una sesión de ≥ 3 min de juego a velocidad aumentada | (a) y (b) verdes. La partida de 15 min en navegador con humano es opcional (TODO-HUMANO de revisión de hito)                                                 | Q4, Q6, todo           |
| **K3** | 150 colonos a ≥ 60 fps                                                                                                               | **Proxy**: `pnpm bench` escenario `econ150` (150 colonos recolectando + 100 unidades): tick medio ≤ 1 ms, p95 ≤ 3 ms (GDD §17.1); `pnpm perf:render` con `?perf=econ150&debug=1`: `updateMs` p95 ≤ 4 ms y ≤ 60 draw calls con ~1 500 casillas de bosque; hash por turno ≤ 0,5 ms (2 000 entidades)                                                                                                                                                                                                                                                                                                                                                                     | Proxy verde ⇒ "parcial". **No se marca cumplido hasta medir en hardware de referencia (Iris Xe/AMD 680M, Chrome): TODO-HUMANO** (misma regla que K1 de F2)   | G5, R2, Q5             |
| **K4** | Generador por etapas determinista con validación de equidad ±5 %                                                                     | tests de `mapgen`: mismo `mapHash` en Node/jitless/Chromium; conectividad; golden `mapHash`; `tools/headless` `mapgen-stats`: 1000 semillas, éxito ≤ 16 intentos ≥ 99,9 %, tiempo ≤ 150 ms (120×120)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Verde y reporte en `media/mapgen-stats.md`                                                                                                                   | M1–M6, Q7              |
| **K5** | Determinismo (regla CLAUDE.md)                                                                                                       | `pnpm test:det`: golden `thousand` **re-pineado con test de equivalencia legacy** (`0x9f6e57a6` reproducido por `hashStateLegacyV2`), golden `village` (economía) y golden `mapgen`; coinciden Node, Node `--jitless`, Chromium principal y Chromium Worker                                                                                                                                                                                                                                                                                                                                                                                                            | 4 entornos locales verdes; Firefox/WebKit solo en CI (STATUS: pendiente de push, **TODO-HUMANO**)                                                            | E1, Q1, Q7             |
| **K6** | Hito 1: sandbox jugable en el navegador (colonos recolectan, construyen y suben a Era II sobre mapa generado, con niebla y minimapa) | `economy.spec.ts` + capturas `media/{aldea,hud,construccion,era2}.png`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Verde + revisión del `reviewer` (puntaje visual del arte provisional, esperable 5–6; se ataca en F6)                                                         | R*, U*, W*, Q6         |
| **K7** | Devlog: video de 20 s de una aldea de 3 a 30 colonos + tarjeta "Hito 1 completo"                                                     | `pnpm devlog`, `docs/progress/fase-03/` (`README.md`, `media/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Publicado en `/devlog`; **puerta humana**: revisión de hito (si no hay respuesta en 24 h rige la recomendación del `reviewer`)                               | F1                     |
| **K8** | Higiene de fase                                                                                                                      | `pnpm format:check`, `lint` (incl. `lint:sim`), `typecheck`, `test`, `test:det`, `data:check`, `build`, `e2e:render` verdes; `ASSETS_LICENSES.md` con el arte nuevo; `contracts.md` y `STATUS.md` actualizados; tag `fase-03`                                                                                                                                                                                                                                                                                                                                                                                                                                          | Salida de cada comando en el README de fase                                                                                                                  | todas, Z               |

**Honestidad sobre hardware (igual que F2):** aquí no hay GPU; K3 queda "proxy verde + TODO-HUMANO". Los goldens heredan "2/4 entornos + CI" de F1.

## 3. Mapa de dependencias y carriles

```
T0-S (contratos sim/shared) ──┬─> E1 ─> E2 ─┬─> E3 ─> E4 ─> E5 ───────────────┐
T0-C (contratos cliente) ─────┤             ├─> G1 ─> G2 ─> G3 ─> G4 ─> G5 ──┤
D1 ─> D2 ─> D3 ───────────────┤             │                                  ├─> W1 ─> W2 ─┐
                              ├─> M1 ─> M2 ─> M3 ─> M4 ─> M5 ─> M6 ───────────┘             │
                              ├─> U1 ─> U2/U3/U4 ─> U5 ─> U6 ─────────────────────────────> I1 ─> Q6 ─> F1 ─> RV ─> Z
                              ├─> R1 ─> R2 ─> R3 ─> R4 ─> R5 ──────────────────────────────┘
                              ├─> A1 ─> A2
                              └─> Q1 ─> Q2 ─> Q3 ─> Q4 ─> Q5 ─> Q7
```

**Seis carriles independientes tras T0 + D1** (propiedad de carpetas en ADR-007 §15): **D** datos · **E** sim/economía núcleo · **G** sim/recolección · **M** mapgen · **W/U/R/A** cliente (puente, HUD, render, arte) · **Q** QA. Se acoplan solo por los contratos y los stubs de T0 (puntos IP0–IP5 de ADR-007 §15). Convergen en **I1** (integración en `boot/game.ts`) y **Q6**.

Olas orientativas (paralelo real de 4–6 agentes): **Ola 0** T0-S, T0-C, D1, A1 · **Ola 1** D2, D3, E1, M1, U1, R1, Q1 · **Ola 2** E2–E3, G1–G2, M2–M3, U2–U4, R2–R3, A2, Q2 · **Ola 3** E4–E5, G3–G4, M4–M5, W1, U5, R4, Q3 · **Ola 4** G5, M6, W2, U6, R5, Q4–Q5, Q7 · **Ola 5** I1, Q6, F1, RV, Z.

Reglas de merge (como F2): una rama `fase-03/<tarea>`; `pnpm typecheck && pnpm test && pnpm lint` verdes, más `pnpm test:det` si se toca `shared`/`sim`/`data`; ninguna tarea edita carpetas de otro carril; cambios de contrato solo por enmienda de ADR-007. **Prohibido** cambiar el golden sin el test de equivalencia legacy verde.

## 4. Tareas

Dueños: `architect`, `sim-engineer` (A), `sim-engineer (2º)` (mapgen), `sim-engineer (3º)` (recolección), `content-designer`, `ui-engineer`, `render-engineer`, `art-pipeline`, `qa-engineer`, `devlog-reporter`, `reviewer`. Estimación en días-agente (≤ 1).

### Contratos y datos

#### T0-S — Esqueleto de contratos de sim/shared (1 d)

- **Dueño:** `sim-engineer` (A). **Depende de:** ADR-007 propuesto.
- **Hace:** (1) **antes de nada**: congela `LEGACY_HASHED_COLUMNS_V2` y `hashStateLegacyV2` (test helper). (2) `shared`: `resources.ts` (`RES_SCALE`, índices), `commands.ts` v3 (tipos, `COMMAND_CODE`, `commandShapeError` por tipo), `simconfig.ts` v2 (`PlayerSpec`, `SpawnSpec`, `resRle`, validación), `simdata.ts` (interfaz capa 2, `simDataHash` layout 2 con fixture), `replay.ts` (`REPLAY_FORMAT_VERSION = 3`), `placement.ts` (`placementError`), `mapscript.ts`, `events.ts`. (3) `sim`: **todas** las columnas de ADR-007 §4 declaradas en `World`/`columns.ts` (hasheadas y no), `PlayerArrays`/`TileLayers` en el mundo, stubs de `economy/*` y de `mapgen/*` (`throw new Error('TODO')`) con firmas exactas, `Sim.events`/`TurnResult.events`. (4) `SimData` de **fixture** hecho a mano para que E/G/M trabajen antes de D2.
- **Criterio:** `pnpm typecheck && pnpm lint && pnpm test` verdes; el test de `ecs.test.ts` (cada campo de `World` en exactamente una lista) pasa con las columnas nuevas; `hashStateLegacyV2` sobre `thousand` = `0x9f6e57a6` (con la sim aún sin lógica nueva); `commandShapeError` rechaza/acepta una tabla de 40 casos (uno por tipo y forma).

#### T0-C — Esqueleto de contratos del cliente (0,5 d)

- **Dueño:** `ui-engineer`, supervisa `architect`. **Depende de:** T0-S (tipos).
- **Hace:** `snapshot.ts` con layout v2 (columnas nuevas, `resVersion`) **solo tipos y `snapshotLayout`**; `protocol.ts` con `hud`/`tiles`/`turn.events`; `HudPlayer`/`HudQueue`; `GameView` ampliado y `FakeHudSource` (fixture con 3→30 colonos y colas) en `ui/`; intents nuevos como no-ops; claves `hud.*` vacías en i18n.
- **Criterio:** `pnpm typecheck` y `test/deps.test.ts` verdes; test de offsets del layout v2 (sin solapes, alineación 4); el HUD arranca con `FakeHudSource` sin sim.

#### D1 — Datos de F3 (1 d)

- **Dueño:** `content-designer`. **Depende de:** T0-S (tipos de `SimData`, solo lectura).
- **Hace:** los bloques de ADR-007 §3.1: `economy.json` (`start`, fuentes ampliadas con `kind/gatherRate/carry`, `tree`, `farm.maxGatherers`, `tuning`, `construction`), `buildings.json` (`ciudadela.dropsOff`, `granja.walkable`), `game.json` (`scope`, `production`, `mapgen`), esquemas Zod `strict`, `DATA_VERSION = 0.3.0`, `COVERAGE.md` con cada **AMBIGUO** nuevo (stock inicial, madera por árbol, PV del ciervo, `farm.maxGatherers`, reembolso de cimientos, `tuning`).
- **Criterio:** `pnpm data:check` verde; tests de esquema (enteros, rangos, `scope` ⊂ ids existentes); el test de F1/F2 de `data` sigue verde.

#### D2 — `buildSimData` v2 y `simDataHash` layout 2 (1 d)

- **Dueño:** `content-designer`. **Depende de:** D1. **Hace:** conversión a enteros de ADR-007 §3.2 (`roundHalfUp` explícito, µ/tick, ppm, expansión de selectores de tecnología), `BuiltSimData` gemelo estructural, cruces de `data:check` (§3.3), test de navegador de `simDataHash` (como F2/S1).
- **Criterio:** tests con valores exactos (`0,43/s → 21 500 µ/tick`; `0,31/s → 15 500`; `Carretilla` ⇒ `+10 % speed`, `+25 % carry` como ppm/entero; `500 víveres, 130 s ⇒ 2600 ticks`); `simDataHash` idéntico en Node y Chromium; una `stat` no soportada en tecnología habilitada hace fallar `data:check`.

#### D3 — Script de mapa completo, `buildMapScript` e i18n (0,75 d)

- **Dueño:** `content-designer`. **Depende de:** D1.
- **Hace:** `maps/llanuras_de_ceniza.json` completado con §4.4 (ciervos, bayas, vetas extra, canteras, ovejas extra) sin alterar los campos del ejemplo del GDD §11.4; `MapObject` ampliado; `buildMapScript(raw): MapScriptSim` y test de asignabilidad a `shared`; claves i18n de nombres de edificios/recursos/eras ya existentes verificadas y las `hud.*` base.
- **Criterio:** test que compara los campos del script contra el literal del GDD; `data:check` verde; `buildMapScript` devuelve solo enteros.

### Carril E — Sim/economía (núcleo, `sim-engineer` A)

#### E1 — Mundo, hash v3 y arranque de partida (1 d)

- **Depende de:** T0-S, (D2 para datos reales; antes, fixture).
- **Hace:** `spawn/despawn` con `kind` y puesta a cero de las columnas nuevas; `PlayerArrays`/`TileLayers`; `hashState`/`hashStateFull` v3 (orden exacto de ADR-007 §5); `createSim` v2 (aplicar `resRle`, `PlayerSpec`, spawns de unidad/edificio/animal, validaciones); `rebuildOccupancy`; `w.speed[i]` leído por `steer/` (1 línea).
- **Criterio:** **test de equivalencia**: `thousand` con la sim v3 ⇒ `hashStateLegacyV2 == 0x9f6e57a6` y los 25 checkpoints antiguos; `ecs.test.ts` verde; test de `despawn` (slot a cero, incl. cola); `createSim` rechaza spawn en casilla bloqueada/id no habilitado; **recién entonces** se pinean los nuevos `finalHash`/checkpoints de `thousand` en `golden.json` (`formatVersion 2`).

#### E2 — Comandos v3, `requestMove` y producción (1 d)

- **Depende de:** E1. **Hace:** extraer `requestMove` a `commands/move.ts`; dispatcher por tipo en `commands/system.ts`; `move/stop` limpian `task`; `train`, `set_rally`, `cancel_queue`, `delete` (unidades); cobro/reembolso; `economy/production.ts` (cola, `popUsed` reservado, `popCap`, `spawnTile`, rally, eventos).
- **Criterio:** tests: costo cobrado al encolar y reembolsado al cancelar; cola llena rechaza; población bloquea la cabeza y la libera al subir `popCap`; colono sale en la casilla correcta y va al rally; mismo estado con comandos desordenados dentro del turno (orden por `playerId`); eventos emitidos.

#### E3 — Construcción: colocación, cimientos, progreso (1 d)

- **Depende de:** E2. **Hace:** `build` (colocar y ayudar), adaptador de `placementError` sobre `World`, cimiento (`occupyRect`/`placeOcc`, `walkable`), **desalojo** de unidades propias bajo la huella, progreso 3t/(n+2) y PV, finalización (`popCap`, granja con `resAmount`), `economy/construction.ts`. (La parte de movimiento del colono hacia la obra la cubre G3.)
- **Criterio:** tests de fórmula: 1 colono = `buildTicks`, 2 = 75 %, 4 = 50 % (exactos en ticks); PV crece monótono y termina en `hpMax`; colocación inválida por terreno/ocupación/recurso/requisito (granja sin Molino); **ningún unidad atrapada** tras colocar sobre un grupo (test de 30 unidades); `rebuildOccupancy` idéntica; granja no bloquea el paso (path atraviesa).

#### E4 — Reparación, eliminación, reseed y PV por era (0,75 d)

- **Depende de:** E3. **Hace:** `repair` (750/375 PV/min ⇒ µPV/tick, deuda de costo al 50 %), `delete` de edificios y cimientos (reembolso proporcional), `reseed`, ajuste de PV al subir de era.
- **Criterio:** reparar de 1 PV a máximo cobra exactamente el 50 % del costo (tolerancia 1 unidad por recurso); 2 reparadores = 750 + 375 PV/min medidos en ticks; sin recursos la reparación se detiene sin error; borrar cimiento a 40 % devuelve 60 % del costo; edificios nuevos de era reciben `hpFxByAge` correcto.

#### E5 — Eras, tecnologías y modificadores (1 d)

- **Depende de:** E2, D2. **Hace:** `advance_age` (requisito: ≥ N **tipos** distintos de la máscara, excluidos, alternativas OR), `research`, cola `Q_TECH/Q_AGE`, bloqueo de la Ciudadela, recomputo de tablas derivadas desde `techBits`, `speed/hpMax/carry/gather/farm_amount`; `economy/{research,mods}.ts`.
- **Criterio:** Era II rechazada con 1 solo tipo de edificio y aceptada con 2 (Casa/Granja no cuentan); la Ciudadela no entrena colonos durante la investigación de era (130 s = 2600 ticks) y otra Ciudadela sí; `Hacha templada` ⇒ `tasa efectiva = base × 1,20`; `Carretilla` ⇒ carga 12 (10 × 1,25) y velocidad +10 %; `Jubón` ⇒ +15 PV a colonos vivos; recomputar tras `clearCaches` da el mismo `hashFull`.

### Carril G — Sim/recolección (`sim-engineer` 3º)

#### G1 — Capa de recursos por casilla, búsqueda y aproximación (1 d)

- **Depende de:** E1. **Hace:** `economy/tiles.ts` (agotar casilla ⇒ `setTerrain(false)`, `resVersion`, `resSum`), `search.ts` (escaneo cuadrado, desempates, exclusiones), `approachTile`, depósito más cercano.
- **Criterio:** tests de búsqueda determinista (mismo resultado con cualquier orden de inserción); casilla interior sin vecino libre se descarta; agotar un árbol desbloquea la casilla y marca sectores sucios (la ruta cambia); `resSum` incremental = recomputo.

#### G2 — Máquina de tareas: tala, minería, bayas y depósito (1 d)

- **Depende de:** G1, E2. **Hace:** `gather` (comando), estados `GATHER_WALK/WORK`, `DROP_WALK`, `SEARCH`, `IDLE`; capacidad y tasa con modificadores; depósito instantáneo; manejo de `PATH_FAILED` (`fails`, exclusión); descarte de carga al cambiar de recurso; eventos.
- **Criterio:** **tasa medida**: 1 colono sobre bosque durante 3 000 ticks produce `0,39/s × t` con error ≤ 1 unidad contando viajes (caminata real incluida) y `gathered` = `stock` depositado + carga; con `Hacha templada` +20 %; ciclo completo árbol→Aserradero→árbol sin intervención; casilla agotada ⇒ busca la siguiente en el radio; sin depósito ⇒ `IDLE` + evento.

#### G3 — Colonos constructores/reparadores y auto-continuación (0,75 d)

- **Depende de:** G2, E3, E4. **Hace:** `BUILD_WALK/WORK`, `REPAIR_WALK/WORK`, recuento `bBuilders`, auto-continuación (siguiente cimiento a ≤ 8 casillas, `autoGatherAfterBuild`).
- **Criterio:** 4 colonos construyen una Casa en el 50 % del tiempo medido; al terminar un Aserradero sus constructores pasan a talar; un colono sin tarea queda `IDLE` y se marca; comandos `move` interrumpen la obra sin perder el cimiento.

#### G4 — Animales y granjas (1 d)

- **Depende de:** G2, E3. **Hace:** `economy/animals.ts` (captura de ovejas por `losTiles`, pastoreo, ciervo estático + golpe de caza provisional, cadáver y podredumbre), `economy/farm.ts` (búfer, golpes de 1/4 de carga, `maxGatherers`, agotamiento, interacción con `reseed`).
- **Criterio:** oveja neutral pasa a ser del primer jugador cuyo colono la ve (desempate determinista); ciervo: 2 golpes de 3 PV matan 5 PV en 80 ticks; cadáver rinde 140 − podredumbre (0,25/s); granja con 1 granjero rinde 0,32/s efectivo (±2 %) y el búfer nunca supera 15; con Yugo una granja nueva trae 250; el jabalí **no** existe en la partida.

#### G5 — Rendimiento e invariantes de recolección (0,5 d)

- **Depende de:** G3, G4. **Hace:** escenario `econ150` (150 colonos repartidos en 6 tipos de tarea + 100 unidades), perfil, presupuesto de búsquedas, ajustes sin asignaciones en bucles; test de no-inanición de `SEARCH`.
- **Criterio:** `pnpm bench` (`econ150`): tick medio ≤ 1 ms y p95 ≤ 3 ms; 0 asignaciones por tick en régimen; ningún colono en `SEARCH` > 100 ticks; informe `docs/progress/fase-03/media/bench-econ.md`.

### Carril M — Generador de mapas (`sim-engineer` 2º + `content-designer`)

#### M1 — Marco del generador (0,75 d)

- **Depende de:** T0-S. **Hace:** `mapgen/{types,rng,noise,hash}.ts`: flujos PRNG por etapa (`hashInts([seedUsed, TAG])`), ruido de valor entero, `GeneratedMap`, `mapHash`, utilidades (disco, polimino, Bresenham, flood fill).
- **Criterio:** ruido idéntico para la misma `(seed, tag, gx, gy)` sin importar el orden de llamadas; `mapHash` sensible a cada capa (test de mutación); `lint:sim` verde.

#### M2 — Etapas 1–3: jugadores, tierras, elevación (0,75 d)

- **Depende de:** M1, D3. **Hace:** inicios en círculo con jitter (1v1 opuestos), `playerLand` (`r = isqrt(A × 113 / 355)`, `baseSize`, `fuzz`), colinas y elevación (Ciudadela a 0).
- **Criterio:** 2, 3, 4 y 8 jugadores sin solape de reservas ni salida del mapa; elevación 0 en `playerLand`; el área de tierra por jugador está a ±10 % del objetivo (informativo); determinismo de la etapa.

#### M3 — Etapas 5–6: bosques por clumps, terreno y conexiones (1 d)

- **Depende de:** M2. **Hace:** clumps (`avoidPlayers`, no solapan, `size`), clases de terreno de presentación, flood fill 4-conexo y talado de corredores.
- **Criterio:** 22 clumps de 30–80 casillas a ≥ 12 de todo inicio; todos los inicios conectados en 1000 semillas; `corridorsCarved` registrado; ningún árbol en reservas de Ciudadela.

#### M4 — Etapa 7: objetos con distancias de §4.4 (1 d)

- **Depende de:** M3. **Hace:** ovejas (8 a 10–12 en grupos de 4, +4 a 14–30), ciervos, jabalíes, bayas, vetas de 7 (8–10) y de 4 (18–26), canteras de 5 y 4, Fragmentos (`avoidPlayers`), relajación hasta `relaxMax`.
- **Criterio:** cada objeto cumple su `dist` (test por `distSq`); polimino conexo del tamaño pedido; ningún objeto sobre árbol ni encima de otro; `approachTile` alcanzable; mismas cantidades por jugador.

#### M5 — Etapa 8: equidad, regeneración y `toSimConfig` (1 d)

- **Depende de:** M4, D2. **Hace:** `FairnessReport` (ADR-007 §12.4), regeneración `seed + attempt`, mejor intento si ninguno pasa, `toSimConfig` con materialización por `enabled` (sin jabalí ni Fragmentos), `maxEntities`.
- **Criterio:** mapa justo ⇒ `|V − media| × 100 ≤ 5 × media` por jugador y clase (test sobre 200 semillas); `createSim(toSimConfig(m))` arranca y pasa `validateSimConfig`; el mapa generado con jabalí habilitado en datos de prueba **no cambia** salvo por los jabalíes añadidos; golden `mapHash`.

#### M6 — Estadística y ajuste de equidad (0,5 d)

- **Dueño:** `content-designer` con `qa-engineer`. **Depende de:** M5. **Hace:** `tools/headless` `mapgen-stats` (1000 semillas × {2,4,8} jugadores): tasa de éxito, intentos, tiempo, desvío; ajusta parámetros `mapgen` de `game.json` (no los de GDD).
- **Criterio:** `media/mapgen-stats.md`: éxito ≤ 16 intentos ≥ 99,9 %, p95 de tiempo ≤ 150 ms (120×120). Si no se alcanza ⇒ enmienda de ADR-007 con etapa de balanceo de madera.

### Carril W — Integración cliente↔sim (`sim-engineer` A)

#### W1 — Snapshot v2, mensajes `hud`/`tiles` y eventos (1 d)

- **Depende de:** E1, T0-C. **Hace:** escritor/lector de snapshot v2 (SAB y transfer), `hud` a 4 Hz, `tiles` agrupado ≤ 2 Hz, `turn.events`, `SimClient.latestHud()/tiles()`, `SnapshotView` ampliado.
- **Criterio:** round trip bit a bit contra un `World` real con edificios y recursos, en ambos modos; 0 asignaciones en régimen; el hash del turno en el Worker == Node; `tiles` solo se envía cuando cambia `resVersion`.

#### W2 — Arranque de partida con mapgen y escenario de economía (0,75 d)

- **Depende de:** W1, M5. **Hace:** `boot/game.ts`: `generateMap` → `toSimConfig` → `init`; escenarios `llanuras` (semilla, jugadores) y `econ150`; `LOCAL_PLAYER` desde parámetros; ganchos `__reinos` de depuración (`stock`, `loadScenario`, `fastForward(turns)`).
- **Criterio:** arrancar `/?scenario=llanuras&seed=1` muestra Ciudadela, 3 colonos, Batidor y recursos; mismo `mapHash` en el cliente que en Node.

### Carril R — Render (`render-engineer`)

#### R1 — Capa de edificios (1 d)

- **Depende de:** T0-C, A1 (placeholder). **Hace:** `render/entities/buildingLayer.ts`: sprites por tipo/era, huellas 2×2…4×4 con orden de profundidad correcto, 4 estados visuales de construcción (cimientos, andamio, 60 %, terminado) según `prog`, contorno de selección, barra de PV bajo demanda.
- **Criterio:** tests puros (orden de profundidad de huellas, estado visual por `prog`); capturas de cada estado; ≤ 15 draw calls añadidas con 60 edificios.

#### R2 — Capa de recursos por casilla (1 d)

- **Depende de:** R1, W1 (o fixture). **Hace:** árboles (bosque ~1 500 casillas **batcheado por chunk**, culling), bayas, vetas de éter con brillo cian, canteras; reacción al mensaje `tiles` (árbol talado desaparece).
- **Criterio:** `pnpm perf:render` con bosque denso: draw calls ≤ 60 y `updateMs` p95 ≤ 4 ms; test de que `tiles` v2 actualiza solo los chunks cambiados; captura.

#### R3 — Entidades de recurso, carga y feedback (0,75 d)

- **Depende de:** R1, A1. **Hace:** ovejas (neutrales/propias), ciervo vivo y cadáver, granja con estado agotado, ícono/color de carga sobre el colono, marcador de punto de reunión.
- **Criterio:** capturas de cada estado; test de mapeo `kind/typeId/resFlags/carryKind → sprite`.

#### R4 — Niebla con edificios y memoria + minimapa económico (0,75 d)

- **Depende de:** R1. **Hace:** `VisionGrid` suma `buildings.losTiles` (Atalaya 6 en Era I), "último estado conocido" de edificios en casillas exploradas, minimapa con puntos de edificios y recursos propios/visibles (modo economía mínimo).
- **Criterio:** `visionGrid.test.ts` extendido (incremental ≡ recomputo con edificios que aparecen/desaparecen); e2e de memoria: edificio enemigo explorado queda desaturado al perder visión.

#### R5 — Fantasma de colocación y huellas (0,5 d)

- **Depende de:** R1, U1. **Hace:** overlay de huella válida/inválida (verde/rojo) usando `placementError` compartido, previsualización con Shift para varios.
- **Criterio:** test de paridad: el fantasma coincide con `placementError` para 200 casos aleatorios; captura válida/inválida.

### Carril U — HUD y entrada (`ui-engineer`)

#### U1 — Store, puente y `FakeHudSource` (0,75 d)

- **Depende de:** T0-C. **Hace:** `GameView.economy/queues/selection.details/placement/notifications` publicados a 10 Hz (lee `hud` y snapshot), intents nuevos cableados a `CommandSink`, constructores de comandos v3 (`input/orders.ts`) validados con `validateCommandShape`.
- **Criterio:** tests: cada intent produce el `Command` exacto de ADR-007 §9 (tabla de 12 casos); el store no re-renderiza a ritmo de juego.

#### U2 — Barra superior y notificaciones (0,75 d)

- **Depende de:** U1. **Hace:** víveres/madera/éter/piedra con conteo de colonos por recurso, población `usada/máx`, era, reloj; notificaciones (población al tope, era alcanzada, tecnología terminada, edificio terminado, recurso agotado, sin recursos).
- **Criterio:** tests de componentes con `FakeHudSource`; accesibilidad (roles/labels, contraste); captura.

#### U3 — Panel de selección y colas (1 d)

- **Depende de:** U1. **Hace:** retratos y estadísticas, colono (tarea, carga), edificio (PV, progreso de obra, cola con progreso de la cabeza y botón de cancelar), recurso (restante).
- **Criterio:** tests con selección mixta (≤ 60 iconos), cola de 5 con cancelación → `cancel_queue{slot}`; capturas.

#### U4 — Cuadrícula de comandos 5×3 y atajos (1 d)

- **Depende de:** U1. **Hace:** cuadrícula con atajos visibles; Q (económico) / W (militar, solo Cuartel/Establo) + letra; entrenar con **Shift = 5** (`batchOnShift`); investigar, avanzar de era; costos y motivo de bloqueo en el tooltip; todo filtrado por `scope`, edad y requisitos; atajos configurables (`input/keymap.ts`).
- **Criterio:** tests: ningún botón fuera de `scope`; botón deshabilitado con motivo correcto (sin recursos, requisito, era); atajos remapeables; captura.

#### U5 — Modo colocación (1 d)

- **Depende de:** U4, R5. **Hace:** entrar con botón/atajo, fantasma, clic izquierdo coloca, Shift mantiene el modo (varios `build`), Esc cancela; regla "casilla no explorada" solo en UI; cursor.
- **Criterio:** tests de estado (colocar 3 casas con Shift emite 3 `build` con los mismos colonos; Esc no emite nada); paridad con `placementError`.

#### U6 — Órdenes contextuales, colono ocioso, punto de reunión y ayudas (1 d)

- **Depende de:** U5. **Hace:** clic derecho contextual (recurso ⇒ `gather`, cimiento propio ⇒ `build`, edificio dañado propio ⇒ `repair`, suelo ⇒ `move`), `.` colono ocioso, `H` Ciudadela, botón de punto de reunión (`set_rally` a posición/recurso), `Supr` ⇒ `delete`, doble clic/Ctrl+clic "todos del tipo".
- **Criterio:** tabla de contexto testeada (10 casos); e2e: seleccionar colono ocioso con `.` y enviarlo a un árbol.

### Carril A — Arte provisional (`art-pipeline`)

#### A1 — Sprites procedurales de edificios y recursos (1 d)

- **Hace:** 9 edificios (+ 4 estados de construcción), árbol, arbusto de bayas, veta de éter con brillo, cantera, oveja, ciervo vivo/cadáver, granja (viva/agotada), íconos de carga y de comandos (UI), todo procedural propio.
- **Criterio:** `pnpm assets:gen` produce atlas + manifest validado; test de cobertura (todo `kind/typeId` en `scope` tiene sprite); sin assets de AoE.

#### A2 — Manifest, cargador y licencias (0,5 d)

- **Depende de:** A1. **Hace:** entradas en `manifest.ts`, integración con `loader.ts` (vía contrato, sin editar `render/`), `ASSETS_LICENSES.md`.
- **Criterio:** `ASSETS_LICENSES.md` completo; el cargador falla en CI si falta un sprite de `scope`.

### Carril Q — QA (`qa-engineer`)

#### Q1 — Arnés headless de economía y goldens (0,75 d)

- **Depende de:** T0-S, E1. **Hace:** `tools/headless`: escenario `village` (1 jugador, 5 min con script de comandos fijo), runner de repeticiones v3, `golden.json` `formatVersion 2` (con `thousand`, `village`, `mapgen`), `test:det` ampliado, helpers de invariantes.
- **Criterio:** `pnpm test:det` con los 3 goldens; el test de equivalencia legacy de E1 está enlazado al CI.

#### Q2 — Bot de build order de scouts (1 d)

- **Depende de:** Q1, E3, G3 (puede empezar con stubs). **Hace:** `tools/headless/src/bots/scouts.ts`: cliente puro (solo `Command`, lectura de `World`): 17 colonos en cadena continua, Casas justo a tiempo, Molino + Aserradero tempranos, reparto fijo de colonos (bayas/ovejas/madera), clic de era al reunir 500 víveres + 2 tipos de edificio con población 21; línea de tiempo registrada.
- **Criterio:** el bot completa la partida determinista (mismo `hashFull` en 2 corridas); 0 comandos rechazados; imprime `clickTick`, `popAtClick`, llegada a Era II.

#### Q3 — Test de calibración (CI) (1 d, iterativo)

- **Depende de:** Q2, M5, G4, E5. **Hace:** `calibration.test.ts` con las 2 aserciones de K1; bucle de ajuste **solo** de parámetros AMBIGUO (con `content-designer`) y del guion del bot; `media/calibracion.md` con la tabla de iteraciones y el `PINNED_CLICK_TICK`.
- **Criterio:** K1 verde; ningún valor del GDD modificado (revisión del `architect`); si tras 3 iteraciones sin progreso ⇒ ADR (PLAN §4.1).

#### Q4 — Soak de 15 min con invariantes (0,75 d)

- **Depende de:** Q3, G5. **Hace:** `soak.test.ts` (18 000 ticks) con el bot extendido (granjas, éter, piedra, Hacha/Yugo/Picos/Carretilla, 2ª Ciudadela, ≥ 80 colonos) e invariantes de K2; auditoría de conservación de recursos.
- **Criterio:** K2(a) verde; replay del soak guardado y reproducible; mismo `hashFull` con `clearCaches`.

#### Q5 — Rendimiento con 150 colonos (0,75 d)

- **Depende de:** G5, R2, W2. **Hace:** `?perf=econ150`, `bench econ150`, gates débiles + gate relativo (±10 %), medición de hash por turno; `media/perf-f3.md`.
- **Criterio:** K3 proxy verde; sección TODO-HUMANO documentada con el comando de medición en hardware real.

#### Q6 — E2E de economía por HUD (1 d)

- **Depende de:** I1. **Hace:** `e2e/render/economy.spec.ts`: colocar Casa/Molino/Aserradero con Shift, entrenar con Shift×5, `.` colono ocioso, punto de reunión, recolectar 4 recursos, investigar Hacha, subir a Era II; asserts por estado de la sim (`__reinos`) y por píxel (edificio visible, fantasma válido/inválido); **0 errores de consola**.
- **Criterio:** K2(b) y K6 verdes; capturas para el devlog.

#### Q7 — Determinismo cruzado de F3 (0,5 d)

- **Depende de:** Q1, M5, E5. **Hace:** `test:det` y `test:det:browsers` con goldens `village` y `mapgen` en Node, `--jitless`, Chromium principal y Worker; `mapHash` y `simDataHash` también en navegador.
- **Criterio:** K5 y parte de K4 verdes (4 entornos locales); Firefox/WebKit anotados como CI.

### Integración, devlog y cierre

#### I1 — Integración en `boot/game.ts` (0,75 d)

- **Depende de:** W2, U6, R5, A2. **Hace:** cablear HUD, render, worker y mapgen; resolver conflictos de carriles; humo manual de la aldea.
- **Criterio:** `pnpm typecheck && pnpm build` verdes; partida de 5 min sin errores de consola; `pnpm e2e:render` verde.

#### F1 — Devlog y STATUS (0,75 d)

- **Dueño:** `devlog-reporter`. **Depende de:** Q6, Q3. **Hace:** 4–6 capturas fijas (aldea, HUD, construcción, Era II, bosque, mapa generado), **video de 20 s** de una aldea de 3 a 30 colonos (semilla fija), tarjeta "Hito 1 completo" con métricas (tests, tick, FPS proxy), `docs/progress/fase-03/README.md`, `STATUS.md`, `CHANGELOG.md`.
- **Criterio:** `pnpm devlog` genera la entrada; `/devlog` la muestra.

#### RV — Revisión adversarial (0,75 d)

- **Dueño:** `reviewer`. **Depende de:** F1. **Hace:** revisa diff, capturas y el mapeo criterio→evidencia; busca desincronizaciones potenciales (estado sin hash, orden de iteración, `Math` prohibido), valores hardcodeados, regresiones de F1/F2; puntaje visual.
- **Criterio:** informe `docs/progress/fase-03/review-r1.md`; bloqueantes vuelven a la tarea dueña (PLAN §4 pasos 3–6).

#### Z — Cierre (0,5 d)

- **Hace:** `contracts.md` actualizado, ADR-007 → Aceptado con enmiendas, STATUS, tag `fase-03` (local, sin merge a `main` mientras siga la regla de la rama de trabajo), listado de TODO-HUMANO.
- **Criterio:** K8.

## 5. Puertas humanas (TODO-HUMANO) de la fase

- Medir **150 colonos ≥ 60 fps** en hardware de referencia (`/?perf=econ150&debug=1`) → cierra K3.
- Firefox/WebKit del determinismo (solo CI en GitHub) → completa K5.
- **Revisión visual de hito (Hito 1)** del devlog; si no hay respuesta en 24 h rige la recomendación del `reviewer`.
- Confirmar o ajustar los valores **AMBIGUO** que el GDD no da (stock inicial, madera por árbol, PV del ciervo, granjeros por granja) tras ver `media/calibracion.md`.
- Decidir si se habilitan Arquería/Forja/Mercado como edificios "sin función" para llegar a la lista de 12 del ejemplo de devlog (por defecto: no).

## 6. Riesgos de la fase

| #   | Riesgo                                                                                                     | Probabilidad / impacto | Mitigación                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | La calibración no cae en 7:55–8:30 ±15 s con solo parámetros AMBIGUO                                       | Media / alto           | Bot parametrizado; ADR si no entra; el criterio **no** se baja. Aritmética de ADR-007 §14 (≥ 7:05 por población) deja holgura de 50–85 s |
| 2   | Atascos del steering con 150 colonos junto a bosques/bayas/veta y desalojo bajo cimientos (F1 no lo probó) | Media / alto           | Tests dedicados en E3/G5; `fails` + exclusión; invariante de `SEARCH`; soak Q4                                                           |
| 3   | Pase de equidad ±5 % con bosques aleatorios                                                                | Media / medio          | Regeneración 16 intentos + mejor intento; estadística M6; etapa de balanceo por enmienda                                                 |
| 4   | Divergencia E↔G en columnas                                                                                | Media / alto           | T0-S declara **todas** las columnas; G no edita `ecs/`                                                                                   |
| 5   | Re-pineo de goldens sin demostrar movimiento intacto                                                       | Baja / alto            | Test de equivalencia legacy obligatorio (E1)                                                                                             |
| 6   | Coste del hash v3 (36 columnas) y del snapshot v2                                                          | Baja / medio           | Presupuesto medido en Q5; si excede, hash incremental por enmienda                                                                       |
| 7   | Rendimiento de render con ~1 500 casillas de bosque                                                        | Media / medio          | Batching por chunk (R2) y gate de draw calls                                                                                             |
| 8   | Valores no dados por el GDD sesgan el balance                                                              | Media / medio          | Marcados AMBIGUO, en datos, reversibles; registro en `COVERAGE.md`                                                                       |
| 9   | Alcance (~42 tareas, 6 carriles)                                                                           | Media / medio          | Olas con IP explícitos; tareas ≤ 1 d; Q3 es el único lazo iterativo                                                                      |
| 10  | Determinismo solo 2/4 entornos en local                                                                    | Conocido               | Igual que F1/F2: CI en GitHub (TODO-HUMANO)                                                                                              |

## 7. Definición de terminado (PLAN §1.3 aplicada)

K1–K8 con evidencia en `docs/progress/fase-03/`; `reviewer` aprobado (puntaje visual ≥ 5–6 aceptado para arte provisional, igual que F2, con ataque en F6); STATUS/CHANGELOG/`contracts.md` al día; tag `fase-03`; entrada de devlog publicada; puerta humana de revisión de hito anotada.
