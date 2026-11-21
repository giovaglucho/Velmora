# Reinos de Ceniza — reglas del proyecto

RTS web isométrico (referencia mecánica: AoE2 DE) desplegado en Render. Diseño en `docs/GDD.md`, plan en `docs/PLAN.md`, estado en `docs/progress/STATUS.md`.

## Siempre

- Leé `docs/GDD.md` (sección afectada) y `docs/progress/STATUS.md` antes de trabajar.
- Monorepo pnpm + Turborepo, TypeScript estricto. Comandos: `pnpm dev | test | test:det | build | typecheck | lint | data:check | devlog`.
- `packages/sim`: SIN floats, `Math.random`, `Date.now`, `Math.sin/cos`, DOM, iteración de `Map`/`Set` sin orden. Punto fijo (`shared/fixed.ts`), PRNG de la partida. Lo bloquea `pnpm lint:sim`.
- Valores de balance SOLO en `packages/data` (JSON + Zod). Nunca constantes mágicas en código.
- Cada cambio de sim requiere test de determinismo (`pnpm test:det`, mismo hash en Node y navegadores).
- Nada de assets/nombres/textos de Age of Empires. Registrar licencias en `ASSETS_LICENSES.md`.
- Al terminar una tarea: tests, captura si es visual, actualizar `STATUS.md`.
- Idioma de UI por defecto: español; código, commits y comentarios en inglés.

## Reglas no negociables (PLAN §1.2)

Datos no constantes · determinismo primero · siempre jugable (main compila, testea y despliega) · verificar con evidencia · revisión adversarial por `reviewer` · cero assets de AoE · devlog por fase.

## Flujo

Protocolo de 8 pasos en `docs/PLAN.md` §4 (contexto → plan → delegar → integrar → revisar → verificar criterios → documentar → cerrar). Comandos: `/fase <n>`, `/verificar`, `/devlog`, `/revisar`, `/estado`.
Prohibido: marcar tareas hechas sin evidencia, desactivar tests para pasar CI, bajar criterios sin ADR.

## Puertas humanas

Si falta algo que solo el dueño puede dar (repo/Render/Atlas, packs de arte, OAuth, aprobaciones, dominio): usar placeholder `TODO-HUMANO`, seguir con lo independiente y listarlo en `STATUS.md`. Nunca poner secretos en el repo.

## Paquetes

`shared` (tipos, protocolo, punto fijo) · `data` (balance JSON + Zod) · `sim` (determinista, sin DOM) · `client` (React + PixiJS) · `server` (Express + relay WS) · `tools/{headless,devlog,asset-pipeline,lint-sim}`.
