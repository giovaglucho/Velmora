# ADR-002: Lockstep con relay WebSocket

## Contexto

Con cientos o miles de unidades por partida (hasta 4v4), enviar el estado por red es inviable. El GDD (15.3) elige lockstep determinista: solo viajan comandos, y todos los clientes simulan lo mismo. Ningun servidor simula la partida, lo que mantiene bajo el costo por partida.

## Decision

- **Relay WebSocket** (`reinos-relay`, paquete `@reinos/server`, `src/relay`): los clientes envian comandos; el relay los agrupa por turno y los difunde a todos. No ejecuta simulacion.
- **Turno de 200 ms** (4 ticks a 20 Hz) por defecto.
- **Ejecucion n+2:** un comando recibido en el turno n se ejecuta en el turno n+2, absorbiendo la latencia.
- **Turno listo:** si un cliente no envia su "turno listo", los demas esperan (pausa "Esperando a jugador").
- **Turno adaptativo 100-400 ms:** el relay ajusta la duracion segun el ping maximo y el cliente mas lento.
- **Hashes de estado:** cada turno los clientes reportan el hash FNV-1a del estado (ADR-003); el relay los compara. Si difieren, se declara desync y se pide un dump para depurar.
- **Reconexion:** el relay guarda el log de comandos; el cliente que vuelve re-simula desde el inicio en modo rapido (o desde un snapshot cada 60 s) y se reincorpora.
- **Validacion en el relay:** forma y frecuencia de comandos y autoria (cada jugador solo manda sobre sus unidades).
- **Repeticiones:** semilla + version de datos + lista de comandos.
- **Contra IA:** mismo camino de codigo con relay local dentro del worker, sin red.
- El protocolo de comandos y mensajes vive en `@reinos/shared`.

## Alternativas consideradas

- **Servidor autoritativo con snapshots/deltas:** anti-trampa fuerte, pero costo de CPU y ancho de banda por partida muy superior; incompatible con el modelo de costos.
- **P2P (WebRTC) sin relay:** sin servidor de partida, pero NAT traversal, sin autoridad de turnos y peor reconexion.
- **Rollback netcode:** buena latencia percibida, pero costoso con miles de unidades y estado grande.
- **Turno fijo sin adaptacion:** mas simple, pero degrada con jugadores de alta latencia.

## Consecuencias

- Costo de servidor minimo; replays casi gratis (100-300 KB por partida).
- Exige determinismo estricto bit a bit entre clientes (ADR-003) y versionado de datos identico.
- Latencia de comando minima de ~2 turnos (400 ms) a turno de 200 ms, compensada con feedback visual inmediato en el cliente.
- Un jugador lento frena a todos (pausa).
- Maphack posible en lockstep; se mitiga ofuscando estado en el worker y con reportes y revision de replays.

## Estado

Aceptado.
