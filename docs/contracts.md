# Contratos entre paquetes

Estado actual (Fase 0/1): varios paquetes son esqueletos; la columna "Previsto" indica lo acordado por GDD/ADR pero aun no implementado.

## Direccion de dependencias permitida

| Paquete            | Puede importar de       |
| ------------------ | ----------------------- |
| `@reinos/data`     | nada (solo zod)         |
| `@reinos/shared`   | nada                    |
| `@reinos/sim`      | `shared`, `data`        |
| `@reinos/client`   | `sim`, `shared`, `data` |
| `@reinos/server`   | `shared`, `data`        |

```
data   shared
  ^      ^
  |\    /|\
  | sim  | \
  |  ^   |  server
  |  |   |
  +-client
```

Prohibido: `sim` importando de `client` o `server`; `server` importando de `sim` o `client`; `client` importando de `server`; ciclos. `tools/*` pueden usar cualquier paquete pero ningun paquete depende de `tools/*`.
Nota: hoy `packages/sim/package.json` solo declara `@reinos/shared`; agregar `@reinos/data` cuando la sim consuma datos.

## Exports por paquete

### `@reinos/data` (`packages/data/src/index.ts`)
- Esquemas zod y tipos (`schemas/*`): common, modifiers, resources, economy, ages, units, buildings, techs, upgrades, factions, maps, ai, i18n, game.
- `parseSchemas`, `crossCheck`, tipos `GameData`, `RawGameData` (validacion).
- `loadGameData`, `bundledRaw`, `toFixed`, `DATA_VERSION`.
- Contrato: datos puros y validados; `toFixed` convierte a punto fijo (escala `economy.fixedScale`) al cargar. No contiene logica de juego.

### `@reinos/shared` (`packages/shared/src/index.ts`)
- `prng`: `Prng`, `createPrng`, `createPrngFromState` (xoshiro128**).
- `hash`: `FNV_OFFSET_BASIS`, `FNV_PRIME`, `fnv1aByte`, `fnv1aInt32`, `hashInts`, `hashBytes`.
- Previsto: helpers de punto fijo (`fixed*.ts`), tablas trigonometricas enteras, tipos de comandos y protocolo de red (ADR-002).
- Contrato: solo codigo determinista, sin DOM, Node ni tiempo; sujeto a `lint:sim` en `fixed|prng|hash`.

### `@reinos/sim` (`packages/sim/src/index.ts`)
- Hoy: `export {}` (esqueleto).
- Previsto: crear/avanzar simulacion por tick, aplicar comandos por turno, `stateHash`, snapshots, ECS SoA, pathfinding.
- Contrato: entrada unica = comandos + semilla + datos; salida = estado/eventos. Sujeto a `lint:sim` completo (ADR-003). No importa de `client` ni `server`.

### `@reinos/client` (`packages/client/src/index.ts`, `main.ts`)
- Hoy: `export {}`. Previsto: render PixiJS, UI React, puente con el worker de sim, cliente WebSocket del relay, audio.
- Contrato: unico paquete con DOM/Pixi/React. Interpola estados de la sim; nunca la modifica salvo emitiendo comandos.

### `@reinos/server` (`packages/server/src/index.ts`)
- `createApi` (`api/`, REST, puerto 3001 por defecto), `createRelay` (`relay/`, WebSocket, puerto 3002).
- Contrato: el relay no simula; solo ordena, valida forma/frecuencia/autoria y compara hashes (ADR-002). Usa tipos de protocolo de `shared`.

## Reglas transversales

- Cambios a un contrato (export publico) requieren actualizar este documento y, si afectan determinismo o protocolo, un ADR.
- Los datos de juego se leen solo via `@reinos/data`; la sim no lee archivos ni red.
