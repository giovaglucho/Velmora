# WebGL por software (SwiftShader) para el render de Fase 2

Resultado del smoke de T0 (`e2e/render/gl-smoke.spec.ts`, página `packages/client/gl-smoke.html`).

- PixiJS `8.23.0`, `preference: 'webgl'` → **WebGL2** activo; `GlProgram` con `#version 300 es` y atributos propios; `Mesh` con índice dibuja el quad; los píxeles de la captura coinciden exactamente (rojo `#ff0000` / verde `#00ff00` en tablero 4×4, fondo negro).
- `UNMASKED_RENDERER_WEBGL` = `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
- `crossOriginIsolated === true` bajo `vite preview` (COOP `same-origin` + COEP `require-corp`).

## Flags (en `playwright.render.config.ts`, `SWIFTSHADER_ARGS`)

```
--no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist
```

Con el Chromium preinstalado (`/opt/pw-browsers/chromium`) **también funciona con solo `--no-sandbox`** (cae a SwiftShader por defecto, sin GPU); se mantienen los flags explícitos para no depender de ese comportamiento por defecto. Para medir (Q2) se añaden `--disable-gpu-vsync --disable-frame-rate-limit` (ADR-006 §10.2).

## Ruido conocido

SwiftShader emite `GL Driver Message (OpenGL, Performance, ..., High): GPU stall due to ReadPixels` cuando se lee el canvas (capturas). Es un aviso de rendimiento, no un fallo: el spec lo filtra; cualquier otro `console.error/warning` o `pageerror` falla el test.

## Cómo correrlo

```
pnpm e2e:render        # build del cliente + Playwright (config de render, puerto 4174)
```
