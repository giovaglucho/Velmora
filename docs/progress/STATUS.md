# STATUS — Reinos de Ceniza

**Fase actual:** 1 — Núcleo de simulación determinista (cerrada técnicamente; K1 parcial, ver abajo)
**Última actualización:** 2026-11-21
**Próxima fase:** 2 — Render isométrico base (PixiJS). Se arranca solo si no hay puerta humana; Fase 2 no depende de Render/Atlas.

## Fase 0 — Fundaciones: CERRADA (1 criterio en puerta humana)
Evidencia: `docs/progress/fase-00/`. Pendiente: URL desplegada en Render (TODO-HUMANO).

## Fase 1 — Núcleo de simulación: criterios del PLAN

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| 1000 unidades × 10 000 ticks → mismo hash en 4 entornos | **2/4 verificados** | Golden `0x9f6e57a6` (`tools/headless/golden.json`). Coinciden: Node, Node `--jitless`, Chromium hilo principal, Chromium Worker (+ control negativo). **Firefox y WebKit: solo en CI** (`test-det-browsers`), no hay navegadores en este entorno. |
| Tick ≤ 3 ms con 400 unidades | ✅ | Bench: media 0,64–0,71 ms, p95 1,5–1,7 ms (`docs/progress/fase-01/media/bench.md`). p99 ≈ 3,2–3,5 ms. |
| 0 violaciones lint:sim | ✅ | `lint:sim OK (32 archivos)`. |
| Tests | ✅ | 344 verdes (shared 104, sim 120, lint-sim 64, data 28, headless 22, server 4, devlog 2). |

Revisión `reviewer` F1: 4 bloqueantes (umbral `progress*4` hardcodeado; `determinismo.md` obsoleto; falta `review-r1.md` y ADR-005 sin aceptar; STATUS desactualizado) → en corrección. Recomendados anotados abajo.

## Puertas humanas pendientes (TODO-HUMANO)
- [ ] **Push/merge de la rama a `main` y primera corrida de CI en GitHub** → cierra K1 (Firefox/WebKit) y verifica CI verde. Rama de trabajo: `claude/focused-cannon-rggng5`.
- [ ] Cuenta de Render con método de pago, conectar `render.yaml`, secrets `RENDER_DEPLOY_HOOK_API|RELAY|WEB` (cierra "URL desplegada" de F0).
- [ ] Clúster MongoDB Atlas + `MONGODB_URI` (Fase 8).
- [ ] Aprobar `.claude/settings.json` (propuesta en `docs/settings.proposed.json`).
- [ ] Decidir si "Valhalla" y "Caravanserai" (técnicas únicas, GDD §10) se mantienen.
- [ ] Revisar interpretaciones AMBIGUO de `packages/data` (ver `packages/data/COVERAGE.md`).
- [ ] Packs de arte/audio (puerta de Fase 6; conviene iniciar la compra en paralelo desde Fase 2).

## Deuda conocida / recomendaciones del reviewer (no bloqueantes)
- Hash de contenido de `SimData` en config/replay (hoy solo se valida el string `dataVersion`).
- Tope de comandos por turno/jugador y de turnos de replay (requisito de relay, Fase 9).
- Test en navegador de `buildSimData` (empates .5 de `Math.round`).
- Bench: reportar también tick individual (picos hasta 7 ms con comandos); sin gate automático de CI.
- Relay sin `maxPayload`/Origin; API sin CORS/helmet/rate limit (Fases 8–9). `JWT_SECRET` compartido → envVarGroup.
- Datos pendientes del GDD: `packages/data/COVERAGE.md` (31 warnings de data:check).
- `REPLAY_FORMAT_VERSION` no subido tras la ola 2 (no hay replays persistidos aún).

## Próximos pasos
Fase 2 (PLAN): PixiJS v8, proyección 2:1, terreno por chunks, cámara, niebla + minimapa, simulación en Web Worker, selección/órdenes, sprites provisionales CC0.
