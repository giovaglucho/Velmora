# Changelog

## [fase-00] — 2026-11-21 — Fundaciones

- Monorepo pnpm + Turborepo, TS estricto, ESLint/Prettier, Vitest, Playwright.
- `packages/data`: esquemas Zod + JSON transcritos del GDD (43 unidades, 25 edificios, 76 techs, 4 facciones) y `pnpm data:check`.
- `lint:sim` (AST) que bloquea floats y APIs no deterministas; PRNG xoshiro128** y hash FNV-1a en `shared`.
- Servidor hola-mundo (API Express 5 + relay ws), cliente placeholder (Vite), `render.yaml`, CI y deploy-staging.
- `tools/devlog` + página `/devlog`. CLAUDE.md, 13 subagentes y 5 comandos.
- ADR-001..004, contratos entre paquetes, ASSETS_LICENSES.md.
