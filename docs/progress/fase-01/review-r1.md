# R1 — Revisión del diseño del ECS y del formato de comandos (Fase 1)

Autor: `architect`. Fecha: 2026-11-21. Alcance: `packages/shared/src`, `packages/sim/src/{ecs,commands,loop}`, ADR-005 con sus Enmiendas (ola 1 y 2), contra `docs/contracts.md` y GDD §15.2. Revisión de diseño sobre el código implementado; no se ejecutaron tests nuevos.

## Veredicto

**Aprobado. Sin bloqueantes de diseño.** ADR-005 pasa a **Aceptado** (2026-11-21). El código implementa el contrato de §3, §4, §5, §8 y §9 con las enmiendas ya documentadas; las lagunas halladas son de endurecimiento para el relay (Fase 9) y de verificación, no de formato. No se pide cambio de contrato ni nueva enmienda.

## Contraste con GDD §15.2

| Requisito GDD §15.2                                                                     | Estado                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECS con arrays tipados SoA, capacidad fija                                              | Cumple (`ecs/world.ts`, `columns.ts` con registro y guardas de compilación y test: cada clave de `World` en exactamente una lista).                                                          |
| Orden de iteración por id ascendente                                                    | Cumple con matiz (M1): el bucle recorre por índice de ranura; los `unitIds` de un comando se ordenan por eid.                                                                                |
| Comandos como única entrada `{turn, playerId, type, unitIds, target, payload}`          | Cumple exacto (`shared/commands.ts`); claves exactas, enteros acotados, `payload` null en F1. La sim solo lee comandos vía `step`/`stepTick`.                                                  |
| Hash FNV-1a por turno sobre componentes clave; desync con dump                          | Cumple: `hash()` por turno en `TurnResult`, `hashFull()` para dump/golden. Cobertura parcial documentada (B2).                                                                              |
| Sin floats / `Math.random` / `Date.now` / trig en la sim; PRNG de partida               | Cumple en `shared`+`sim` (bloqueado por `lint:sim`); PRNG xoshiro128** con estado en el hash.                                                                                                |
| Comandos con ejecución en turno n+2 (§15.3)                                             | La sim exige `cmd.turn === turno actual` y rechaza el resto íntegro; la política n+2 es del relay/cliente. Coherente.                                                                         |

## Revisión del ECS (ADR-005 §3-4)

- `eid = (gen << 16) | idx` con `gen` en [1, 32767] y `idx` < 65535: `makeEid` usa `>>> 0`, `isAlive` rechaza no enteros, `<= 0`, índice fuera de capacidad y generación distinta; `NONE = 0` nunca es válido. Correcto.
- `despawn` pone a cero toda la ranura (incluidos los 64 waypoints), con pila LIFO de ranuras libres: reutilización determinista y sin estado residual. La envoltura de generación (32767 → 1) reintroduce eids antiguos tras 32767 reutilizaciones de la misma ranura; aceptable y ya cubierto por el test de eid obsoleto (la F1 no despawnea en la sim; revisar si F4 combate lo hace masivamente).
- `HASHED_COLUMNS` coincide con el orden exacto del ADR §4 (más `eid` derivado). `hashStateFull` coincide con §4 (pathCount, waypoints [pathIdx, pathCount), repathAt, `hashBytes` de terreno y ocupación).

## Revisión de comandos y loop (ADR-005 §5, §8)

- Orden estable por `playerId`, copia+dedupe+orden ascendente de `unitIds`, omisión individual de ajenos/muertos, meta acotada y `nearestFree`, no re-encolar si ya `PATH_QUEUED`, `stop` invalida entrada en cola: todo conforme a §5.1-5.6.
- `step` ≡ 4 × `stepTick` por construcción (`step` llama a `tickOnce` 4 veces); comandos solo en el primer tick del turno; `stepTick` con comandos fuera de frontera lanza `RangeError`. Orden de sistemas fijo y conforme a §8.
- Neutral (owner 255) no es mandable: `playerId <= MAX_PLAYERS - 1`.

## Hallazgos

### Bloqueantes

Ninguno.

### Menores y requisitos diferidos (ordenados por prioridad)

**H1 — Sin tope de comandos por turno/jugador ni de turnos en repeticiones hostiles (requisito de F9, DoS para el relay).** Detectado por `reviewer`; lo asumo. `applyCommands` valida y ordena todos los comandos recibidos sin límite; cada uno admite hasta `MAX_CMD_UNITS = 1024` eids (con copia y `sort`), y `step` no acota `commands.length`. `validateReplay` acota `totalTurns` solo a `MAX_REPLAY_TURNS = 2^31 - 1` y no limita comandos totales, por lo que una repetición subida puede forzar un tiempo de simulación arbitrario. En F1 es inocuo (entrada local de confianza). **Requisito de F9 (obligatorio antes de abrir el relay o el servicio de repeticiones):** (a) el relay limita comandos por jugador y turno y unidades por comando acumuladas, descarta el exceso con la misma regla en todos los clientes (la regla debe ser determinista y vivir en el relay, no en la sim, o entrar a la sim como rechazo uniforme); (b) límite de ratio de comandos por segundo; (c) el servicio de repeticiones impone `totalTurns` y bytes máximos antes de simular, y ejecuta con presupuesto de tiempo y en worker aislado; (d) el relay comprueba que `cmd.playerId` es el jugador autenticado de la conexión (la sim solo verifica propiedad de las unidades, no la identidad del emisor). Registrar en `PLAN.md` F9 y `contracts.md`.

**H2 — `hash()` por turno no cubre `repathAt`, `pathCount` ni los waypoints.** Documentado en ADR §4 y en Consecuencias. Una divergencia solo en esas columnas se detecta recién cuando afecta una columna hasheada (`pathIdx`, `pos*`, `stuck`) o con `hashFull()`. Se acepta para F1 (coste O(unidades) por turno y `test:det` usa `hashFull`). Propuesta: en F9, el relay pide `hashFull()` cada N turnos (p. ej. cada 25 s) o ante cualquier discrepancia para el dump; reevaluar si se mide un desync tardío por esta vía.

**H3 — `createSim` solo valida el string `dataVersion`, no el contenido de `SimData`.** Dos clientes con la misma versión pero tablas distintas (build parcial, datos manipulados, bug de `buildSimData`) simularían distinto y solo se descubriría por desync. Propuesta (**tarea de F2/F9**): `shared` calcula `simDataHash` (FNV sobre todos los arrays de `SimData` en orden fijo); `Replay` y el protocolo de partida lo incluyen y `createSim`/`runReplay` lo comparan (cambiar el formato exige `REPLAY_FORMAT_VERSION` 2). Hasta entonces `DATA_VERSION` debe subirse ante cualquier cambio de balance que entre en `SimData`.

**H4 — `buildSimData` usa `Math.round` con empates .5 sin ejercitar en el navegador.** `Math.round` y la aritmética IEEE-754 de doble precisión están definidas por el estándar y son idénticas entre motores, pero el caso de empate (`x.5` exacto, y valores como `speed * scale / TICKS_PER_SECOND` que caen en la frontera) no tiene test en navegador, y `buildSimData` corre en cada cliente (fuera de `lint:sim`, en `packages/data`). **Test pendiente (F2, bajo coste):** añadir a la spec de Playwright un caso que ejecute `buildSimData` sobre `bundledRaw` y sobre una tabla sintética con empates .5 y compare el `simDataHash` (H3) o el JSON resultante contra Node en Chromium, Firefox y WebKit. Alternativa a evaluar: redondeo entero explícito (`floorDiv(2n + d, 2d)`) para eliminar el riesgo por diseño.

**M1 — Orden "por id ascendente" del GDD es en realidad por ranura.** La iteración del ECS y del hash va por índice de ranura; la sim ordena `unitIds` por eid (generación en los bits altos). Ambos son deterministas y suficientes, pero el texto del GDD §15.2 es ambiguo. Acción: precisar en el GDD (o en ADR) "por índice de ranura; los listados de comandos por eid" cuando se toque el GDD. Sin impacto de código.

**M2 — `stop` conserva `goalX/goalY` y `repathAt` anteriores.** Están en el hash (`goal*`), así que el valor residual es parte del estado: determinista pero ruido semántico (dos unidades en el mismo sitio con distinto historial de órdenes hashean distinto). Aceptable; si F3+ introduce lógica que lea `goal*` con `orderKind = NONE`, poner a cero en `stop` y subir `REPLAY_FORMAT_VERSION`.

**M3 — Rechazos silenciosos por unidad.** `TurnResult.rejected` cuenta comandos descartados enteros; las omisiones por unidad (ajena, muerta, duplicada, meta sin casilla libre) no se cuentan. Para el relay y la depuración de desyncs conviene un contador adicional `skippedUnits` (no entra al hash). Menor; opcional en F2.

**M4 — `MAX_CMD_UNITS = 1024` frente a selecciones grandes.** Suficiente para el diseño (el GDD toma AoE2: selección máxima 60); si se permiten selecciones mayores, se parte en varios comandos. Anotado por si cambia el diseño de control de grupos.

**M5 — Asignación por turno en `hashState`.** Construye un array `cols` en cada llamada (una vez por turno). Es insignificante frente al presupuesto de 3 ms por tick; solo se menciona porque el ADR §8 pide cero asignaciones en el régimen estacionario por tick (el hash es por turno, no por tick). Opcional: reutilizar un array a nivel de módulo.

## Requisitos que dejo registrados

| Id | Para    | Requisito                                                                                                                               |
| -- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| H1 | F9      | Topes de comandos/unidades por turno y jugador, ratio, `playerId` = identidad de la conexión, límites de `totalTurns`/bytes en repeticiones, ejecución con presupuesto. |
| H2 | F9      | `hashFull()` periódico o bajo demanda para el dump de desync.                                                                           |
| H3 | F2 / F9 | `simDataHash` en `Replay` y protocolo; comprobación en `createSim`/`runReplay`.                                                          |
| H4 | F2      | Test en navegador de `buildSimData` con empates .5 (o redondeo entero explícito).                                                       |

## Cambios hechos en esta revisión (solo documentación)

- ADR-005: Estado pasa a **Aceptado** (2026-11-21); corregido el nombre del dorado a `tools/headless/golden.json`.
- `docs/progress/fase-01/determinismo.md`: golden pineado (`finalHash` 2674808742 = `0x9f6e57a6`), eliminada la advertencia obsoleta; K1 verificado en Node, Node jitless, Chromium (hilo y Worker); Firefox y WebKit pendientes de CI (abierto, TODO-HUMANO).
- `docs/progress/fase-01/media/bench.md`: cabecera con el comando real (`bench`).
- `docs/progress/fase-01/plan.md`: nombres reales (`golden.json`, `determinismo.md`, `media/bench.md`) y estado de R1.
