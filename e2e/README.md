# E2E (Playwright, solo Chromium)

```
BASE_URL=https://<despliegue> pnpm e2e          # contra un despliegue/preview
pnpm e2e                                        # contra http://localhost:4173 (p. ej. `vite preview`)
CHROMIUM_PATH=/ruta/a/chrome pnpm e2e           # otro binario de Chromium
```

- Usa el Chromium preinstalado en `/opt/pw-browsers/chromium` si existe (no ejecutar `playwright install` en este entorno).
- En CI (`CI=1`) el smoke se salta si no hay `BASE_URL`.
- `--trace off` ya va en el script `e2e`.
