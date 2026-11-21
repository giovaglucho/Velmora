# Benchmark de tick (Fase 1)

Comando: `pnpm --filter @reinos/headless run bench` (`pnpm --filter @reinos/headless run debug-visual` solo regenera este archivo)

- Máquina: Intel(R) Xeon(R) Processor @ 2.10GHz (4 núcleos, linux x64)
- Node: v22.23.5
- Calentamiento: 200 ticks descartados; medición: 500 turnos (2000 ticks)
- Tiempo por tick = tiempo del turno (comandos + 4 ticks + hash) / 4; mapa 200x200 con obstáculos, ordenes de movimiento reemitidas cada 100 turnos.

| Unidades | media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | máx (ms) | con orden activa (%) |
| -------: | ---------: | -------: | -------: | -------: | -------: | -------------------: |
| 400 | 0.707 | 0.572 | 1.723 | 3.368 | 3.493 | 98.1 |
| 1000 | 1.699 | 1.440 | 3.336 | 4.058 | 7.022 | 98.9 |

K2 (400 unidades, media y p95 <= 3 ms/tick): CUMPLE.
