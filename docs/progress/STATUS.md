# STATUS — Reinos de Ceniza

**Fase actual:** 3 — Economía y construcción (Eras I–II). **Planificada, sin código**: `docs/progress/fase-03/plan.md` (42 tareas) + `docs/adr/ADR-007-economia-y-construccion.md` (Propuesto).
**Última actualización:** 2026-11-21
**Rama de trabajo:** `claude/focused-cannon-rggng5` (tags locales `fase-00`, `fase-01`; `fase-02` al cerrar). No hay merge a `main`.

## Resumen de fases

| Fase                      | Estado                        | Pendiente (puerta humana)                                 |
| ------------------------- | ----------------------------- | --------------------------------------------------------- |
| 0 Fundaciones             | Cerrada                       | URL desplegada en Render                                  |
| 1 Núcleo de simulación    | Cerrada con K1 **2/4**        | Firefox/WebKit (solo CI en GitHub)                        |
| 2 Render isométrico       | Cerrada con K1 **solo proxy** | Medir ≥ 60 fps con 400 unidades en hardware de referencia |
| 3 Economía y construcción | No iniciada                   | Revisión visual de hito (Hito 1) al cerrarla              |

Verificación del cierre de F2 (local, 2026-11-21): `format:check`, `lint` (incl. `lint:sim`), `typecheck`, `test` (**621 tests**), `test:det`, `data:check`, `build` en verde; `golden:check` = `0x9f6e57a6` (idéntico desde F1); `pnpm e2e:render` 28/28 en Chromium con SwiftShader.

## Fase 0 — Fundaciones: CERRADA (1 criterio en puerta humana)

Evidencia: `docs/progress/fase-00/`. Pendiente: URL desplegada en Render (TODO-HUMANO).

## Fase 1 — Núcleo de simulación: CERRADA con K1 parcial

| Criterio                                                | Estado              | Evidencia                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1000 unidades × 10 000 ticks → mismo hash en 4 entornos | **4/4 verificados** (CI run 44948949919, job `test-det-browsers`: Chromium, Firefox, WebKit) | Golden `0x9f6e57a6` (`tools/headless/golden.json`). Coinciden: Node, Node `--jitless`, Chromium hilo principal, Chromium Worker. **Firefox y WebKit solo en CI** (`test-det-browsers`); no hay en este entorno. |
| Tick ≤ 3 ms con 400 unidades                            | ✅                  | Media 0,64–0,71 ms, p95 1,5–1,7 ms (`docs/progress/fase-01/media/bench.md`); p99 ≈ 3,2–3,5 ms.                                                                                                                  |
| 0 violaciones lint:sim                                  | ✅                  | `lint:sim OK`.                                                                                                                                                                                                  |

Revisión F1: bloqueantes corregidos (umbral a `game.json`, `review-r1.md`, ADR-005 Aceptado, docs). Hardening posterior (F2/S1–S3): `simDataHash` (REPLAY_FORMAT_VERSION 2, golden idéntico), test de navegador de `buildSimData`, `skippedUnits`.

## Fase 2 — Render isométrico base: CERRADA con K1 solo proxy

| Criterio (PLAN)                                   | Estado            | Evidencia                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400 unidades a ≥ 60 fps en hardware de referencia | **Medido por el dueño: 60 FPS** (frame 16,6 ms, 15 draw calls, tick sim 0,41 ms, `?perf=400&debug=1`, modo sab). Una sola lectura, no sostenida 60 s; repetir con `__reinos.perfReport()` si se quiere evidencia más firme. | Solo proxy en SwiftShader (`docs/progress/fase-02/media/perf.md`): updateMs p95 1,3–2,0 ms, ≤ 15 draw calls, tick p95 ≈ 0,5 ms; FPS software 6–12 (informativo). Gates débiles (baseline autorreferencial). **TODO-HUMANO**: medir con `/?perf=400&debug=1`. |
| Selección y movimiento sin lag perceptible        | ✅ (con matiz)    | e2e: caja de 100 unidades, clic derecho mueve, orden→primer movimiento ≤ 5 ticks; `inputToMarkerMs` acotado contra `frameMs` (en SwiftShader no alcanza 20 ms absolutos).                                                                                    |
| Niebla correcta                                   | ✅                | `VisionGrid` incremental ≡ recomputo (tests), píxeles de los 3 estados, enemigos ocultos fuera de visión.                                                                                                                                                    |
| Sin bordes de tile visibles                       | ✅ (matiz visual) | Ratio de costuras ≤ 1,03 (umbral 1,15; control negativo 3,56). Terreno provisional **borroso**.                                                                                                                                                              |
| Devlog: capturas + GIF de 100 unidades            | ✅                | `docs/progress/fase-02/` (`README.md`, `media/`), `/devlog`.                                                                                                                                                                                                 |

Revisión `reviewer` F2: 1 bloqueante (obstáculos no dibujados) → corregido (lagos = agua, bosques = verde-ceniza oscuro, roca caminable distinta; e2e por píxeles). Puntaje visual del arte provisional: legibilidad 6, cohesión 6, riqueza 4, wow 3 (esperable; se ataca en Fase 6). Los menores se corrigieron (debug solo con `VITE_ENABLE_DEBUG`, contraste de grupos, ADR-006 Aceptado).

Desviación del PLAN: sprites/terreno provisionales **procedurales propios** (`tools/asset-pipeline`), no CC0 de Kenney/Quaternius (no hay descarga garantizada); registrados en `ASSETS_LICENSES.md`.

## Puertas humanas pendientes (TODO-HUMANO)

- [x] Push a `main` y CI en GitHub: `verify`, `e2e` y `test-det-browsers` en verde (run 44948949919). Cierra K1 de F1.
- [x] Medición de FPS del dueño en su navegador: 60 FPS (ver tabla de Fase 2). Cierra K1 de F2 con la salvedad de una sola lectura.
- [x] Render desplegado con Blueprint (plan free, autoDeploy desde `main`). URLs: web `https://reinos-web-4bcg.onrender.com/`, API `https://reinos-api.onrender.com/health` (OK), relay `https://reinos-relay.onrender.com/health` (OK). `reinos-kv` es privado (sin URL). Los deploy hooks de GitHub ya no hacen falta.
- [ ] Verificar `/devlog/` en la URL de `reinos-web` (el rewrite de devlog se quitó: revisar que cargue).
- [x] `.claude/settings.json` aprobado por el dueño y activo (permisos pnpm/playwright/blender, bloqueo de push forzado, hooks de lint:sim y recordatorio de STATUS).
- [x] Clúster MongoDB Atlas `Cluster0` (M0, AWS Frankfurt), usuario de base de datos y acceso `0.0.0.0/0` creados. `MONGODB_URI` todavía NO está cargado en Render: se carga por formulario seguro cuando arranque la Fase 8.
- [ ] Packs de arte/audio y herramientas de IA para assets (puerta de Fase 6; conviene empezar ya).
- [ ] Decidir si "Valhalla" y "Caravanserai" (GDD §10) se mantienen; revisar interpretaciones AMBIGUO de `packages/data/COVERAGE.md`.

## Deuda conocida (no bloqueante)

- Niebla en el cliente: **debe migrar a la sim en Fase 4** (requisito documentado en ADR-006).
- Tope de comandos por turno/jugador y de turnos de replay (requisito de relay, Fase 9). Relay sin `maxPayload`/Origin; API sin CORS/helmet/rate limit (Fases 8–9). `JWT_SECRET` compartido → envVarGroup.
- `LOCAL_PLAYER=0` fijo en el cliente (multijugador: debe venir de la sesión).
- Bosque sin sprite de árbol; terreno borroso; minimapa sin terreno legible; `ui.png`/`buildings.png` generados pero sin consumir.
- Perf: no hay escenario 4v4; el baseline FPS es autorreferencial; demo400 empieza con el enemigo en niebla.
- Datos pendientes del GDD en `packages/data/COVERAGE.md` (31 warnings de `data:check`).
- Medios del devlog duplicados (`docs/` y `packages/client/public/devlog`, ~34 MB): evaluar Git LFS o excluir.

## Próximos pasos (retomar con `/estado` y luego `/fase 3`)

Contexto de la sesión anterior llegó al límite (regla PLAN §4.1): se guardó el estado aquí. El plan de Fase 3 ya existe; **no empezar de cero**: leer `docs/progress/fase-03/plan.md` y ADR-007, pasar el ADR a Aceptado tras revisión R1 del architect y lanzar las olas (T0 stubs primero).
Decisiones del architect a confirmar (ver ADR-007): hito de Era II medido como _clic_ de subida con 21 de población (ventana CI 9200–10500 ticks) porque 7:55–8:30 como _llegada_ es imposible con los tiempos del GDD (si no entra con los valores AMBIGUO, hace falta un ADR); jabalí diferido a F4; 9 edificios construibles (no 12); valores no dados por el GDD marcados AMBIGUO (stock inicial 200/200/100/200, madera por árbol 100, etc.).
Riesgos: steering de F1 sin probar con 150 colonos junto a bloqueos; equidad ±5 % del generador (medir con 1000 semillas); cambio mínimo en `steer/` (usar `w.speed[i]`); subida de formatos (REPLAY_FORMAT_VERSION 3, DATA_VERSION 0.3.0, SNAPSHOT_VERSION 2) con re-pineo del golden solo tras test de equivalencia.

Resumen de la Fase 3 según PLAN:

Fase 3 (PLAN): colonos con recolección y caminata real, construcción 3t/(n+2), eras I–II, generador de mapas "Llanuras de Ceniza" con validación de equidad, HUD económico, bot de build order de scouts (Era II ≈ 7:55–8:30 ±15 s) como test de CI. Termina con puerta humana de revisión de hito (Hito 1; si no hay respuesta en 24 h rige la recomendación del reviewer).
