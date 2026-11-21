# Changelog

## [fase-00] — 2026-11-21 — Fundaciones

- Monorepo pnpm + Turborepo, TS estricto, ESLint/Prettier, Vitest, Playwright.
- `packages/data`: esquemas Zod + JSON transcritos del GDD (43 unidades, 25 edificios, 76 techs, 4 facciones) y `pnpm data:check`.
- `lint:sim` (AST) que bloquea floats y APIs no deterministas; PRNG xoshiro128** y hash FNV-1a en `shared`.
- Servidor hola-mundo (API Express 5 + relay ws), cliente placeholder (Vite), `render.yaml`, CI y deploy-staging.
- `tools/devlog` + página `/devlog`. CLAUDE.md, 13 subagentes y 5 comandos.
- ADR-001..004, contratos entre paquetes, ASSETS_LICENSES.md.

## [fase-01] — 2026-11-21 — Núcleo de simulación determinista

- Punto fijo (`shared/fixed.ts`, trig por tablas), PRNG, hash FNV-1a, ECS SoA, comandos, loop 20 Hz, repeticiones.
- Grid, A* jerárquico por sectores 16×16, steering. Runner headless, golden `0x9f6e57a6`, determinismo Node/Chromium.

## [fase-02] — 2026-11-21 — Render isométrico base

- Cliente PixiJS v8: terreno por chunks con splatting (sin costuras), entidades con interpolación, niebla de guerra y minimapa.
- Simulación en Web Worker (SAB/transfer), selección con caja, órdenes, grupos de control, HUD React (es).
- Assets provisionales procedurales, `simDataHash`, devlog con GIF de 100 unidades. K1 (60 fps) solo proxy.
