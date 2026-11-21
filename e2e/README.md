# E2E (Playwright, solo Chromium)

```
BASE_URL=https://<despliegue> pnpm e2e          # contra un despliegue/preview
pnpm e2e                                        # contra http://localhost:4173 (p. ej. `vite preview`)
CHROMIUM_PATH=/ruta/a/chrome pnpm e2e           # otro binario de Chromium
```

- Usa el Chromium preinstalado en `/opt/pw-browsers/chromium` si existe (no ejecutar `playwright install` en este entorno).
- En CI (`CI=1`) el smoke se salta si no hay `BASE_URL`.
- `--trace off` ya va en el script `e2e`.

## Determinismo (`e2e/determinismo/`)

Config aparte: `playwright.det.config.ts` (la config principal ignora esa carpeta).

```
pnpm test:det:browsers                      # Chromium: hilo principal, Worker y --jitless
PW_ALL_BROWSERS=1 pnpm test:det:browsers    # además Firefox y WebKit
```

- Firefox y WebKit **no se pueden correr en este entorno** (no hay binarios y no se debe ejecutar `playwright install`); solo los activa `PW_ALL_BROWSERS=1`, que pone el job `test-det-browsers` de CI. Sin esa variable solo corre Chromium.
- Informe: `docs/progress/fase-01/determinismo.md`.

## Render (`e2e/render/`, WebGL por software)

Config aparte: `playwright.render.config.ts` (la principal ignora esa carpeta). `pnpm e2e:render` construye el cliente, levanta `vite preview` (puerto 4174, con COOP/COEP) y corre Chromium con SwiftShader. Flags y notas: `docs/progress/fase-02/swiftshader.md`. Hoy solo contiene el smoke de T0 (`gl-smoke.spec.ts`); Q1 añade el resto.

## Rendimiento y medios de Fase 2 (`e2e/perf/`)

- `pnpm perf:render` (assets + build + `perf-render.mjs`): proxy de rendimiento en Chromium + SwiftShader; escribe `docs/progress/fase-02/media/perf.{md,json}` y sale con error si falla algún gate. Opciones tras `--`: `--reps N --warmup S --window S --modes sab,transfer --zooms 0,1,2 --update-baseline --no-harness`. K1 sigue siendo TODO-HUMANO (hardware real).
- `pnpm media:render` (requiere el cliente construido): capturas `iso-z*.png`, `fog.png`, `minimap.png` y `select-move-100.{gif,webm}` con el escenario `demo200` (usa `ffmpeg` del sistema).
