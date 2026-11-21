# Reinos de Ceniza

RTS web isométrico 2.5D con simulación determinista (lockstep), jugable en el navegador. Diseño en `docs/GDD.md`, plan en `docs/PLAN.md`, estado en `docs/progress/STATUS.md`.

## Comandos

Requiere Node >= 22 y pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev          # client (vite :5173) + server en paralelo
pnpm test         # tests
pnpm test:det     # determinismo
pnpm typecheck
pnpm lint
pnpm data:check   # valida el balance JSON
pnpm build
pnpm devlog       # genera el devlog estático
```

Server local: `pnpm --filter @reinos/server dev` (API :3001, relay :3002, `/health` en ambos). Client build + preview: `pnpm --filter @reinos/client build && pnpm --filter @reinos/client preview` (:4173).

## Estructura

- `packages/shared` tipos, protocolo, punto fijo · `packages/data` balance JSON + Zod · `packages/sim` simulación determinista
- `packages/client` cliente web (Vite) · `packages/server` API Express + relay WebSocket
- `tools/{headless,devlog,asset-pipeline,lint-sim}` · `docs/` GDD, plan, ADR, progreso

## Despliegue

`render.yaml` (Blueprint) define `reinos-web` (static + `/devlog/`), `reinos-api`, `reinos-relay` y `reinos-kv`. CI en `.github/workflows/ci.yml`; en push a `main`, `deploy-staging.yml` dispara los deploy hooks de Render. Detalles y supuestos: `docs/adr/ADR-004-render-blueprint.md`. Variables: `.env.example`.

## Puertas humanas (TODO-HUMANO)

Cuenta y Blueprint en Render, MongoDB Atlas (`MONGODB_URI`), `JWT_SECRET`, OAuth, dominio, secrets de GitHub `RENDER_DEPLOY_HOOK_API|RELAY|WEB`, packs de arte.
