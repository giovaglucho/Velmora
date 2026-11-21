# Benchmark de tick (Fase 1)

Comando: `pnpm --filter @reinos/headless run debug-visual`

- Máquina: Intel(R) Xeon(R) Processor @ 2.10GHz (4 núcleos, linux x64)
- Node: v22.23.5
- Calentamiento: 200 ticks descartados; medición: 500 turnos (2000 ticks)
- Tiempo por tick = tiempo del turno (comandos + 4 ticks + hash) / 4; mapa 200x200 con obstáculos, ordenes de movimiento reemitidas cada 100 turnos.

| Unidades | media (ms) | p50 (ms) | p95 (ms) | p99 (ms) | máx (ms) | con orden activa (%) |
| -------: | ---------: | -------: | -------: | -------: | -------: | -------------------: |
| 400 | 0.064 | 0.063 | 0.071 | 0.080 | 0.217 | 98.2 |
| 1000 | 0.175 | 0.168 | 0.229 | 0.252 | 0.473 | 98.9 |

K2 (400 unidades, media y p95 <= 3 ms/tick): CUMPLE.
