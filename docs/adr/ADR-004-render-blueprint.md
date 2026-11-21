# ADR-004: Render Blueprint (render.yaml)

Estado: aceptada (con supuestos no verificados). Fecha: 2026-11-21. Contexto: PLAN Fase 0, GDD 15.5.

## Decisiones

- Cuatro recursos: `reinos-web` (static), `reinos-api` y `reinos-relay` (web, runtime node), `reinos-kv` (Key Value). MongoDB es externo (Atlas): `MONGODB_URI` con `sync: false`.
- Region `frankfurt` para api, relay y kv (deben compartir region para usar la red privada). Elegida por jugadores en Europa/LatAm-Europa y latencia razonable; alternativa `oregon` si el publico principal es America. Cambiarla en los tres servicios a la vez. La static site es global (CDN) y no lleva region.
- API y relay en plan `starter` (pago) para evitar suspension por inactividad; el relay DEBE ser pago (partidas en vivo). La static site usa el plan gratuito.
- `autoDeploy: false` en servicios node: el despliegue lo dispara GitHub Actions (`deploy-staging.yml`) con deploy hooks, tras pasar CI.
- Headers COOP `same-origin` + COEP `require-corp` en toda la static site (aislamiento cross-origin para SharedArrayBuffer/Worker de la simulacion).
- Rewrites: `/devlog/*` -> `/devlog/*` primero, luego `/*` -> `/index.html` (SPA), para que el devlog estatico no caiga en el fallback.
- Secretos y URLs dependientes de despliegue: `sync: false`, marcados `# TODO-HUMANO`. Nada secreto en el repo.
- `REDIS_URL` se inyecta con `fromService` (`keyvalue`, `connectionString`).

## Supuestos no verificables sin cuenta Render

- Nombres de campos del esquema: `runtime: static` + `staticPublishPath` (el pedido decia `publishPath`; el campo documentado es `staticPublishPath`), `routes` (type/source/destination), `headers` (path/name/value), `type: keyvalue` con `maxmemoryPolicy` e `ipAllowList`, `healthCheckPath`, `fromService.property: connectionString`. Escritos de memoria; el YAML se valida sintacticamente, no contra Render.
- Que Render sirve un archivo estatico existente antes de aplicar rewrites; la regla explicita de `/devlog/*` es defensa por si no.
- `pnpm --filter ... start:api` en runtime: depende de que el workspace completo quede instalado en el build (si, con `pnpm install` sin `--prod`). El relay en el mismo repo reutiliza el mismo build.
- Nombres `reinos-*` pueden estar tomados globalmente en Render (subdominio); puede requerir sufijo.
- Costos: starter x2 + kv starter; revisar precios vigentes.
- Para el plan de Key Value, `starter` puede no ser un nombre valido segun la fecha (los planes de KV tienen nombres propios); ajustar en el dashboard si el Blueprint lo rechaza.

## Puertas humanas

Crear cuenta/Blueprint en Render, Atlas (`MONGODB_URI`), `JWT_SECRET`, OAuth, dominio, deploy hooks como secrets de GitHub (`RENDER_DEPLOY_HOOK_API|RELAY|WEB`).
