# Proxy de rendimiento del render (Fase 2, Q2)

> **Advertencia.** Esto es un **proxy** medido con WebGL por software (SwiftShader) en Chromium headless. **No** es el hardware de referencia (portátil con iGPU Iris Xe / Radeon 680M, GDD §17.1). El criterio **K1** ("400 unidades a >= 60 fps en el hardware de referencia") **no se da por cumplido** con este informe: queda **TODO-HUMANO** (ver abajo). Los FPS de software son solo informativos; lo que se compuerta es trabajo de CPU/JS y conteos de comandos de GPU (ADR-006 §10.1–10.2).

Generado por `pnpm perf:render` (`e2e/perf/perf-render.mjs`). Resultado global del proxy: **VERDE**.

## Entorno y método

- Fecha: 2026-11-21T18:24:07.007Z; Chromium 153.0.8010.12; Node v22.23.5.
- Renderer WebGL: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
- CPU: Intel(R) Xeon(R) Processor @ 2.30GHz x4 (máquina de sesión, posiblemente compartida: ver varianza).
- Viewport 1280x720 @1x; flags: `--no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit`.
- Escenario: `demo400` (mapa 128x128, 2 jugadores, 200 unidades por jugador = 400). Las 200 unidades propias reciben órdenes de mover cada 4 s alternando objetivos, de modo que hay movimiento durante toda la ventana; las 200 enemigas están quietas. No existe un escenario "4v4" en el repo (los escenarios son demo100/demo200/demo400, 2 jugadores), por eso no se mide.
- Cámara centrada en el ejército propio; zooms 0,6 / 1 / 1,4; modos de snapshot `sab` y `transfer`.
- 3 s de calentamiento + 10 s de ventana por repetición; 3 repeticiones con página nueva cada una. Las celdas muestran **mediana (mín–máx)** entre repeticiones; los gates se evalúan sobre la mediana.
- `updateMs` = JS por frame (interpolar + culling + sprites + niebla/minimapa), sin rasterizar. `renderMs` = JS de envío de Pixi. `tickMs` = tick de simulación medido dentro del Worker, que informa un p95 por ventana de 1 s (20 ticks). El gate usa la **mediana de las ventanas**; el **peor p95 de ventana** se muestra aparte (informativo): SwiftShader satura todos los núcleos y un solo tick desplazado por el planificador del SO infla el p95 de su ventana (con 20 muestras, p95 = la 2ª mayor). Referencia sin contención de GPU por software: `pnpm bench` (tick medio 0,71 ms, p95 1,72 ms con 400 unidades, Fase 1).

## Gates del proxy

| Métrica | Gate | Qué demuestra |
| --- | --- | --- |
| updateMs p95 | <= 4 ms | El JS del cliente deja margen frente al presupuesto de 16,6 ms. Heurística: no mide la GPU. |
| Draw calls por frame (p95) | <= 60 | Trabajo de comandos acotado (chunks visibles + batches). |
| tickMs p95 (Worker, mediana de ventanas de 1 s) | <= 3 ms | La sim en navegador no se degrada con 400 unidades. |
| ticksDropped | = 0 | El pacing del Worker no descarta ticks en régimen estacionario. |
| FPS vs línea base | >= 60 % de `e2e/perf/perf-baseline.json` | Detecta regresiones grandes. El margen es ancho a propósito (el plan dice 20 %): la varianza medida en SwiftShader sobre una máquina compartida es mayor, y un gate más estrecho sería flaky. |
| Errores de consola | 0 | Sin errores/avisos de WebGL o Pixi (se filtra solo el aviso de rendimiento `ReadPixels` de SwiftShader). |

## Resultados

| Escenario | Modo | Zoom | Unidades visibles (p50) | updateMs p50 | updateMs p95 | updateMs max | renderMs p95 | Draw calls p95 (max) | tickMs avg / p95 (mediana de ventanas) / peor ventana | ticksDropped | FPS software (informativo) | FPS p5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| demo400 | sab | 0.6 | 200 | 0.785 (0.725–0.815) | 1.37 (1.315–1.385) | 2.665 | 0.975 (0.95–1.015) | 15 (15) | 0.425 / 0.625 (0.5–0.855) / 2.7 (2.565–3.27) | 0 | 12.265 (12.193–12.611) | 10.873 |
| demo400 | sab | 1 | 200 | 0.86 (0.8–1.015) | 1.325 (1.205–2.275) | 3.075 | 0.89 (0.795–0.905) | 7 (7) | 0.434 / 0.555 (0.535–0.605) / 0.84 (0.695–1.375) | 0 | 8.655 (8.627–8.756) | 7.847 |
| demo400 | sab | 1.4 | 182 | 0.86 (0.78–0.895) | 1.495 (1.26–1.51) | 3.235 | 0.725 (0.65–1.025) | 7 (7) | 0.413 / 0.51 (0.5–0.53) / 0.655 (0.655–0.79) | 0 | 7.014 (6.912–7.061) | 6.327 |
| demo400 | transfer | 0.6 | 200 | 0.75 (0.72–0.8) | 1.3 (1.08–1.345) | 2.585 | 0.875 (0.875–0.975) | 15 (15) | 0.435 / 0.58 (0.54–0.61) / 0.945 (0.875–1.785) | 0 | 12.47 (12.366–12.777) | 11.069 |
| demo400 | transfer | 1 | 200 | 0.93 (0.905–1.16) | 1.61 (1.465–1.765) | 2.615 | 1.29 (0.995–1.475) | 7 (7) | 0.454 / 0.62 (0.485–0.635) / 1.155 (1.03–2.1) | 0 | 8.417 (8.287–8.616) | 7.437 |
| demo400 | transfer | 1.4 | 182 | 1.1 (1.09–1.17) | 1.975 (1.69–2.175) | 3.86 | 1.18 (1.165–1.23) | 7 (7) | 0.44 / 0.555 (0.515–0.595) / 1.425 (1.355–2.755) | 0 | 6.694 (6.566–6.95) | 5.887 |

**Ojo con "Unidades visibles":** en el juego integrado las 200 unidades enemigas empiezan en niebla (ejércitos en lados opuestos del mapa), así que solo se dibujan ~200 sprites aunque la sim simule 400. La carga de render con las 400 visibles está en la sección siguiente.

Cada celda con rango: mediana (mín–máx) entre repeticiones. `updateMs max` es la mediana de los máximos (picos aislados de GC/planificador; no se compuertan).

## Estrés de render con 400 unidades visibles (arnés sin niebla)

`render-harness.html?units=400&moving=1&loop=1&select=40&spacing=0.4`: mismo `Renderer` (terreno por chunks, sprites, anillos de selección) con un feed falso de 400 unidades en movimiento (bloque denso de 8x8 tiles, que cabe entero en el viewport a los 3 zooms) y 40 anillos; sin Worker, sin niebla, sin minimapa. Es la carga de sprites que el integrado solo alcanza cuando los dos ejércitos están a la vista.

| Zoom | Unidades visibles (p50) | updateMs p50 | updateMs p95 | renderMs p95 | Draw calls p95 | FPS software (informativo) |
| --- | --- | --- | --- | --- | --- | --- |
| 0.6 | 400 | 0.145 (0.14–0.305) | 0.225 (0.185–0.485) | 1.135 (0.98–1.305) | 17 | 13.753 (13.612–13.841) |
| 1 | 400 | 0.165 (0.145–0.355) | 0.31 (0.245–0.575) | 1.34 (0.98–1.84) | 5 | 7.7 (7.479–7.704) |
| 1.4 | 391 | 0.185 (0.165–0.37) | 0.77 (0.36–3.12) | 1.495 (1.45–1.695) | 5 | 4.934 (4.876–4.979) |

## Resultado de los gates

| Configuración | Gate | Valor | Límite | OK |
| --- | --- | --- | --- | --- |
| demo400 sab z0.6 | updateMs p95 | 1.37 | 4 | si |
| demo400 sab z0.6 | draw calls p95 | 15 | 60 | si |
| demo400 sab z0.6 | tickMs p95 (worker) | 0.625 | 3 | si |
| demo400 sab z0.6 | ticksDropped | 0 | 0 | si |
| demo400 sab z0.6 | console errors | 0 | 0 | si |
| demo400 sab z0.6 | fps vs baseline (relative) | 12.265 | 7.359 | si |
| demo400 sab z1 | updateMs p95 | 1.325 | 4 | si |
| demo400 sab z1 | draw calls p95 | 7 | 60 | si |
| demo400 sab z1 | tickMs p95 (worker) | 0.555 | 3 | si |
| demo400 sab z1 | ticksDropped | 0 | 0 | si |
| demo400 sab z1 | console errors | 0 | 0 | si |
| demo400 sab z1 | fps vs baseline (relative) | 8.655 | 5.193 | si |
| demo400 sab z1.4 | updateMs p95 | 1.495 | 4 | si |
| demo400 sab z1.4 | draw calls p95 | 7 | 60 | si |
| demo400 sab z1.4 | tickMs p95 (worker) | 0.51 | 3 | si |
| demo400 sab z1.4 | ticksDropped | 0 | 0 | si |
| demo400 sab z1.4 | console errors | 0 | 0 | si |
| demo400 sab z1.4 | fps vs baseline (relative) | 7.014 | 4.208 | si |
| demo400 transfer z0.6 | updateMs p95 | 1.3 | 4 | si |
| demo400 transfer z0.6 | draw calls p95 | 15 | 60 | si |
| demo400 transfer z0.6 | tickMs p95 (worker) | 0.58 | 3 | si |
| demo400 transfer z0.6 | ticksDropped | 0 | 0 | si |
| demo400 transfer z0.6 | console errors | 0 | 0 | si |
| demo400 transfer z0.6 | fps vs baseline (relative) | 12.47 | 7.482 | si |
| demo400 transfer z1 | updateMs p95 | 1.61 | 4 | si |
| demo400 transfer z1 | draw calls p95 | 7 | 60 | si |
| demo400 transfer z1 | tickMs p95 (worker) | 0.62 | 3 | si |
| demo400 transfer z1 | ticksDropped | 0 | 0 | si |
| demo400 transfer z1 | console errors | 0 | 0 | si |
| demo400 transfer z1 | fps vs baseline (relative) | 8.417 | 5.05 | si |
| demo400 transfer z1.4 | updateMs p95 | 1.975 | 4 | si |
| demo400 transfer z1.4 | draw calls p95 | 7 | 60 | si |
| demo400 transfer z1.4 | tickMs p95 (worker) | 0.555 | 3 | si |
| demo400 transfer z1.4 | ticksDropped | 0 | 0 | si |
| demo400 transfer z1.4 | console errors | 0 | 0 | si |
| demo400 transfer z1.4 | fps vs baseline (relative) | 6.694 | 4.016 | si |
| harness400 (sin niebla) z0.6 | updateMs p95 | 0.225 | 4 | si |
| harness400 (sin niebla) z0.6 | draw calls p95 | 17 | 60 | si |
| harness400 (sin niebla) z0.6 | console errors | 0 | 0 | si |
| harness400 (sin niebla) z1 | updateMs p95 | 0.31 | 4 | si |
| harness400 (sin niebla) z1 | draw calls p95 | 5 | 60 | si |
| harness400 (sin niebla) z1 | console errors | 0 | 0 | si |
| harness400 (sin niebla) z1.4 | updateMs p95 | 0.77 | 4 | si |
| harness400 (sin niebla) z1.4 | draw calls p95 | 5 | 60 | si |
| harness400 (sin niebla) z1.4 | console errors | 0 | 0 | si |

## K1 es un proxy: TODO-HUMANO

- Con GPU por software los FPS de arriba **no** se trasladan al hardware de referencia en ninguna dirección con garantías (la rasterización por CPU suele ser más lenta que una iGPU en fill-rate y más rápida en overhead de comandos). Un número alto aquí no demuestra K1; uno bajo tampoco lo refuta.
- Lo que sí aporta este proxy: el coste de CPU/JS por frame (`updateMs`), el número de draw calls y el coste del tick del Worker están muy por debajo de los umbrales; el trabajo de GPU por frame es pequeño y acotado.
- **Pendiente (TODO-HUMANO, listado en `STATUS.md`)**: en el portátil de referencia con Chrome, abrir `/?perf=400&debug=1` (build de producción, `pnpm --filter @reinos/client preview`), dejar correr 60 s con unidades en movimiento a zoom 1 y calidad Alta, ejecutar `__reinos.perfReport()` en la consola y adjuntar el JSON. **Aceptación: `fpsP5 >= 60`.** Hasta entonces K1 figura como "proxy verde + hardware real pendiente".

## Reproducir

```
pnpm perf:render                        # assets + build + medición completa (6 configuraciones x 3 repeticiones, ~6 min)
pnpm perf:render -- --reps 1 --window 5  # corrida rápida
pnpm perf:render -- --update-baseline    # reescribe e2e/perf/perf-baseline.json con los FPS actuales
```
