# STATUS — Reinos de Ceniza

**Fase actual:** 1 — Núcleo de simulación determinista (en curso)
**Última actualización:** 2026-11-21

## Fase 0 — Fundaciones: CERRADA (con 1 criterio pendiente de puerta humana)

Evidencia (local, `docs/progress/fase-00/media/pipeline.png`): lint, typecheck, 96 tests, test:det, data:check, build y e2e smoke en verde. Revisión `reviewer`: 3 bloqueantes (test rojo por líneas frágiles, ADR-001..003 + ASSETS_LICENSES faltantes, e2e de CI no-op) → corregidos y re-verificados; menores de lint:sim, esquemas strict, deploy-staging tras CI, turbo outputs → corregidos.
Criterios del PLAN: build+CI verdes ✅ (local; primer run en GitHub pendiente de push a main) · data:check ✅ · .claude/agents + CLAUDE.md ✅ · /devlog con entrada F0 ✅ (build local) · **URL de Render con placeholder ⏳ TODO-HUMANO**.
Tag git local `fase-00`. No se hizo merge a `main` (la rama de trabajo es `claude/focused-cannon-rggng5`).

## Puertas humanas pendientes (TODO-HUMANO)

- [ ] Cuenta de Render con método de pago; conectar el Blueprint `render.yaml`; secrets de GitHub `RENDER_DEPLOY_HOOK_API|RELAY|WEB`. (Bloquea solo el criterio "URL desplegada".)
- [ ] Merge de la rama a `main` y primera corrida de CI en GitHub.
- [ ] Clúster MongoDB Atlas + `MONGODB_URI` (Fase 8).
- [ ] Aprobar `.claude/settings.json` (propuesta en `docs/settings.proposed.json`; el clasificador bloqueó escribirlo directamente).
- [ ] Decidir si "Valhalla" y "Caravanserai" (nombres de técnicas únicas, GDD §10) se mantienen.
- [ ] Revisar interpretaciones AMBIGUO de `packages/data` (ver COVERAGE.md): Tessaline +25% precisión, Anillo de tensión, Yugo gratis de Valdren, Skjald PV por era.

## Deuda conocida (no bloqueante)

- Relay sin `maxPayload`/validación de Origin; API sin CORS/helmet/rate limit (Fase 8–9).
- `render.yaml`: `JWT_SECRET` compartido API/relay → usar envVarGroup (Fase 8). Campos del Blueprint no verificables sin cuenta (ADR-004).
- Datos pendientes del GDD listados en `packages/data/COVERAGE.md` (31 warnings de data:check).
- Devlog F0 sin fps/tick (se miden desde F1/F2).

## Próximos pasos

Fase 1 según PLAN: punto fijo, ECS SoA, loop 20 ticks, comandos, hash por turno, rejilla + A* jerárquico, runner headless, bench.
