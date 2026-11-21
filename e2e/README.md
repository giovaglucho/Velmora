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
