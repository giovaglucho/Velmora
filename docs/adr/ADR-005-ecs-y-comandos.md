# ADR-005: Contrato de punto fijo, ECS, comandos, loop, repetición y pathfinding (Fase 1)

## Contexto

La Fase 1 reparte el núcleo de simulación entre varios agentes que trabajan en paralelo (PLAN §Fase 1; plan de tareas en `docs/progress/fase-01/plan.md`):

- **A** `shared/fixed.ts` y tablas trigonométricas.
- **B** ECS, loop, comandos y hash por turno en `packages/sim`.
- **C** rejilla, A\* jerárquico y steering en `packages/sim`.
- **D/E/F** runner headless, determinismo multi-entorno y visualización.

Este ADR fija las **interfaces exactas** que comparten. Cualquier desviación requiere enmendar este ADR antes de mergear. Complementa ADR-003 (punto fijo, PRNG, FNV-1a, lint:sim) y ADR-002 (lockstep: turno de 4 ticks, comandos ejecutados en el turno n+2, que es decisión del relay/cliente, no de la sim). GDD §15.2 es la fuente de los números.

Convenciones: todos los tipos son TypeScript estricto; "entero" = `number` con `Number.isInteger`; "uint32" = entero en `[0, 2^32)`. Los ejemplos de código fijan **firmas y semántica**, no la implementación. Todo código de `packages/sim/src` y `packages/shared/src` pasa `pnpm lint:sim` (sin `/` salvo en `shared/src/fixed.ts`, que está exento por ruta exacta; en el resto, `Math.trunc(a / b)`, `| 0`, `>>`).

## Decisión

### 1. Constantes globales (`packages/shared/src/fixed.ts`)

```ts
export type Fx = number; // entero; unidad = 1/1000 de casilla
export const FX_SCALE = 1000; // = economy.fixedScale (verificado por test contra @reinos/data)
export const FX_ONE: Fx = 1000; // 1 casilla
export const FX_HALF: Fx = 500;
export const TILE_FX: Fx = 1000; // alias de FX_ONE para claridad en código de rejilla
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 50;
export const TURN_TICKS = 4; // turno de 200 ms (GDD §15.3)
export const ANGLE_STEPS = 1024; // ángulo entero: 0..1023, una vuelta completa
export const ANGLE_MASK = 1023;
export const TRIG_ONE = 16384; // 1.0 en la escala de sin/cos (2^14)
export const TRIG_SHIFT = 14;
export const FX_MAX_OPERAND = 1048575; // 2^20 - 1; límite de |a|,|b| en fxMul/fxDiv
```

Rangos: posiciones en `[0, 512_000]` (mapa máx. 512 casillas; GDD §2 usa ≤ 220). Las coordenadas de la sim **nunca son negativas**; las velocidades y deltas sí pueden serlo.

### 2. API pública de `fixed.ts`

Todas las funciones son puras, sin asignaciones, y **truncan hacia cero** (`Math.trunc`). Precondiciones violadas lanzan `RangeError` solo donde se indica; el resto es comportamiento indefinido documentado (los tests de propiedades fijan los rangos).

```ts
export function fxFromInt(n: number): Fx; // n * FX_SCALE
export function fxToInt(a: Fx): number; // trunc(a / FX_SCALE) (hacia cero)
export function fxMul(a: Fx, b: Fx): Fx; // trunc(a*b / FX_SCALE); |a|,|b| <= FX_MAX_OPERAND
export function fxDiv(a: Fx, b: Fx): Fx; // trunc(a*FX_SCALE / b); b === 0 -> RangeError; |a|,|b| <= FX_MAX_OPERAND
export function mulDiv(a: number, b: number, c: number): number; // trunc(a*b / c); |a*b| <= 2^40; c === 0 -> RangeError
export function isqrt(n: number): number; // floor(sqrt(n)) EXACTO, entero n en [0, 2^53); sin Math.sqrt
export function fxSqrt(a: Fx): Fx; // isqrt(a * FX_SCALE); a >= 0
export function distSq(dx: Fx, dy: Fx): number; // dx*dx + dy*dy; |dx|,|dy| <= 2^25 (resultado < 2^52)
export function dist(dx: Fx, dy: Fx): Fx; // isqrt(distSq(dx, dy))
export function clamp(v: number, lo: number, hi: number): number;
export function fxToTile(a: Fx): number; // trunc(a / TILE_FX); a >= 0
export function tileToFx(t: number): Fx; // t * TILE_FX (esquina de la casilla)
export function tileCenterFx(t: number): Fx; // t * TILE_FX + FX_HALF
export function sinT(angle: number): number; // angle entero cualquiera (se enmascara con ANGLE_MASK); resultado en [-TRIG_ONE, TRIG_ONE]
export function cosT(angle: number): number; // idem; cosT(a) = sinT(a + 256)
export function mulTrig(v: number, t: number): number; // trunc(v * t / TRIG_ONE); |v*t| <= 2^40
export function atan2Idx(dy: Fx, dx: Fx): number; // ángulo 0..1023; 0 = +x (este), crece hacia +y (sur); (0,0) -> 0; error <= 1 paso
```

Semántica obligatoria:

- `isqrt` es exacto para todo entero de `[0, 2^53)`; test contra `BigInt` (≥ 10^6 casos aleatorios con semilla + bordes `0, 1, 2^k±1, 2^53-1`).
- `fxMul/fxDiv/mulDiv` coinciden con la aritmética exacta con `BigInt` (truncada hacia cero) en todo el rango documentado.
- `sinT/cosT`: tabla de **un cuarto de onda** `SIN_QUARTER` (Int32Array/array de 257 enteros: `round(16384 * sin(i * 2π / 1024))` con `i = 0..256`, redondeo mitad lejos de cero) en `shared/src/trig-tables.ts`, generada por `tools/gen-trig.mjs` (usa `Math.sin`; fuera de `lint:sim`) y **commiteada como literal**. Cuadrantes por simetría: `sinT(a)` con `q = (a & 1023) >> 8`, `i = (a & 255)`: q0 `T[i]`, q1 `T[256-i]`, q2 `-T[i]`, q3 `-T[256-i]`. Valores exactos: `sinT(0)=0`, `sinT(256)=16384`, `sinT(512)=0`, `sinT(768)=-16384`.
- `atan2Idx`: reducción por octante y tabla `ATAN_OCTANT` de 257 enteros (`round(1024/(2π) * atan(i/256))`, `i = 0..256`; razón `i = trunc(min * 256 / max)`). Ídem generada y commiteada.
- Las tablas tienen un **hash pineado** (FNV-1a de sus enteros) en `packages/shared/test/trig.test.ts`. Cambiar una tabla es romper compatibilidad de repeticiones: requiere subir `REPLAY_FORMAT_VERSION` (§9) y enmendar este ADR.
- Ninguna otra función de `shared` o `sim` usa `/` libre, `Math.sqrt` ni trigonometría.

### 3. Identidades y layout del ECS (`packages/sim/src/ecs/`)

**EntityId (`eid`)**: entero de 31 bits sin signo `(gen << 16) | idx`, con `idx` en `[0, 65535)` (índice de ranura) y `gen` en `[1, 32767]` (generación). `NONE = 0` (nunca válido porque `gen >= 1`). Es el único id que aparece en comandos y hashes. Helpers exportados por `ecs/`: `eidIndex(eid) = eid & 0xffff`, `eidGen(eid) = eid >>> 16`, `makeEid(gen, idx)`.

**World**: capacidad fija `maxEntities` (default 4096; máx. 65535) decidida en `createSim` (`config.maxEntities`). Todas las columnas son arrays tipados preasignados con longitud `maxEntities` (salvo `wpX/wpY`). No hay crecimiento dinámico.

```ts
export interface World {
  readonly capacity: number; // maxEntities
  highWater: number; // 1 + mayor idx usado alguna vez; el iterador llega hasta aquí
  count: number; // entidades vivas

  // identidad
  alive: Uint8Array; // 0/1
  gen: Uint16Array; // generación vigente de la ranura (>= 1 una vez usada)
  // propiedades fijas por tipo
  typeId: Uint16Array; // índice en SimData.units (orden de units.json)
  owner: Uint8Array; // 0..maxPlayers-1; 255 = neutral
  radius: Int32Array; // Fx, copiado de SimData.units.radiusFx[typeId] al spawn
  // transform / movimiento
  posX: Int32Array;
  posY: Int32Array; // Fx
  prevX: Int32Array;
  prevY: Int32Array; // Fx; posición al inicio del tick (snapshot Jacobi + interpolación de render)
  velX: Int32Array;
  velY: Int32Array; // Fx por tick (la velocidad aplicada en el último tick)
  facing: Uint16Array; // ángulo 0..1023
  // salud
  hp: Int32Array; // Fx (hp de units.json × 1000)
  // órdenes de movimiento
  orderKind: Uint8Array; // ORDER_NONE=0, ORDER_MOVE=1
  goalX: Int32Array;
  goalY: Int32Array; // Fx
  pathState: Uint8Array; // PATH_IDLE=0, PATH_QUEUED=1, PATH_FOLLOW=2, PATH_FOLLOW_PARTIAL=3, PATH_FAILED=4
  pathCount: Uint8Array; // waypoints válidos (<= MAX_WAYPOINTS)
  pathIdx: Uint8Array; // índice del waypoint actual
  wpX: Int32Array;
  wpY: Int32Array; // longitud capacity * MAX_WAYPOINTS; waypoints de la ranura idx en [idx*MAX_WAYPOINTS, +pathCount)
  stuck: Uint16Array; // ticks consecutivos sin progreso
  repathAt: Int32Array; // tick antes del cual no se vuelve a pedir ruta
}
export const MAX_WAYPOINTS = 64;
```

Funciones del módulo (`ecs/world.ts`):

```ts
export function createWorld(capacity: number): World;
export function spawn(w: World, init: SpawnInit): number; // devuelve eid; lanza RangeError('entity capacity') si no hay ranura
export function despawn(w: World, eid: number): boolean; // false si eid ya no es válido (gen distinto o muerto)
export function isAlive(w: World, eid: number): boolean; // alive[idx]===1 && gen[idx]===eidGen(eid)
export interface SpawnInit {
  typeId: number;
  owner: number;
  x: Fx;
  y: Fx;
  radius: Fx;
  hp: Fx;
}
```

Reglas de spawn/despawn **deterministas**:

- `spawn`: si la pila de ranuras libres no está vacía, toma el tope (LIFO); si está vacía, usa `idx = highWater++`. Incrementa `count`; `alive=1`; deja `gen[idx]` como está (la generación se incrementa en `despawn`; la primera vez es 1: `createWorld` inicializa `gen` en 1). Inicializa las columnas con el `init` y **cero** en el resto (`orderKind=0`, `pathState=0`, `stuck=0`, `repathAt=0`, `velX/velY=0`, `facing=0`, `prevX/prevY = x/y`).
- `despawn`: `alive=0`, `gen[idx] = gen[idx] === 32767 ? 1 : gen[idx] + 1`, pone **todas** las columnas de la ranura a cero (para que el hash no dependa de basura), `count--`, empuja `idx` a la pila de libres.
- Los comandos y cualquier otro sistema que reciba un `eid` valida con `isAlive` (una referencia obsoleta se ignora, nunca falla).
- **Iteración**: siempre ascendente por índice de ranura. Idioma obligatorio:
  ```ts
  for (let i = 0; i < w.highWater; i++) {
    if (w.alive[i] === 0) continue; /* ... */
  }
  ```
  Prohibido iterar `Map`/`Set` en `sim` sin orden (lint). Para derivar un `eid` de una ranura viva: `makeEid(w.gen[i], i)`.
- **Añadir una columna** exige: declararla en `ecs/columns.ts` en una de las dos listas `HASHED_COLUMNS` (con su posición en el orden de hash, §4) o `UNHASHED_COLUMNS`; un test (`ecs.test.ts`) falla si un campo de `World` no figura en exactamente una lista. Cambiar el orden o el contenido de `HASHED_COLUMNS` cambia todos los hashes: subir `REPLAY_FORMAT_VERSION`.

### 4. Hash de estado (`ecs/hash.ts`)

FNV-1a de 32 bits con `fnv1aInt32` (`shared/hash.ts`), valores enteros de 32 bits con signo o sin signo indistintamente. Orden **exacto**:

```
h = FNV_OFFSET_BASIS
h = int32(h, tick)
h = int32(h, world.count)
h = int32(h, grid.version)
h = int32(h, prng[0]); int32(h, prng[1]); int32(h, prng[2]); int32(h, prng[3])      // prng.getState()
for i in 0 .. highWater-1, alive[i] === 1, ascendente:
  eid, typeId, owner, posX, posY, velX, velY, facing, hp,
  orderKind, goalX, goalY, pathState, pathIdx, stuck
return h >>> 0
```

- `sim.hash()` = lo anterior (barato, O(unidades); se calcula **al final de cada turno** y lo devuelve `step`).
- `sim.hashFull()` = `hash()` más, por cada entidad viva: `pathCount`, los waypoints `[pathIdx, pathCount)` como pares (x, y), `repathAt`; y el hash `hashBytes` de `grid.terrain` y `grid.occ`. Es lo que usa `test:det` y el dump de desync (más lento, no se llama por turno).
- No se hashean `prevX/prevY` ni `radius` (derivados). Las cachés (rutas, grafo de sectores, hash espacial) **no son estado**: deben ser semánticamente transparentes; un test borra todas las cachés a mitad de una partida y exige el mismo `hashFull()` final.

### 5. Comandos (`packages/shared/src/commands.ts`)

```ts
export type CommandType = 'move' | 'stop';
export const COMMAND_CODE: Readonly<Record<CommandType, number>> = { move: 1, stop: 2 };

export interface PosTarget {
  kind: 'pos';
  x: Fx;
  y: Fx;
}

export interface Command {
  turn: number; // turno de EJECUCIÓN (lo fija el relay/cliente; la sim solo exige turn === turno actual)
  playerId: number; // 0..maxPlayers-1
  type: CommandType;
  unitIds: number[]; // eids
  target: PosTarget | null;
  payload: null; // F1: siempre null (reservado; F3+ lo tipará por comando)
}
```

Variantes: `move` exige `target: PosTarget`; `stop` exige `target: null`. `payload` debe ser `null` en F1. Añadir un tipo de comando = enmienda del ADR + nueva entrada en `COMMAND_CODE` (los códigos existentes no cambian).

`validateCommandShape(c: unknown): c is Command` (en `shared`, sin dependencias) comprueba: tipos enteros, `unitIds` de longitud `1..MAX_CMD_UNITS` (= 1024), `x,y` en `[0, 512_000]`, claves exactas. Es lo que usará también el relay (ADR-002).

**Semántica en la sim** (`sim/src/commands/`):

1. Los comandos del turno se ordenan con orden **estable** por `playerId` ascendente (`Array.prototype.sort` es estable desde ES2019); dentro de un jugador, orden de llegada. El llamador no tiene que ordenar.
2. Un comando es **rechazado** (se descarta íntegro, sin efecto, y se cuenta en `TurnResult.rejected`) si: `turn !== turno actual`, `playerId` fuera de rango, `type` desconocido, forma inválida, o `payload !== null`.
3. Dentro de un comando válido, cada `eid` de `unitIds` se procesa en orden **ascendente** (se copia, deduplica y ordena; no se muta el array del llamador) y se **omite** individualmente si `!isAlive` o `owner !== playerId`.
4. `move`: para cada unidad: `orderKind=MOVE`; meta = `target` acotada a `[FX_HALF, width*TILE_FX - FX_HALF]` (idem y); si la casilla de la meta está bloqueada, la meta pasa a `tileCenterFx` de la casilla libre más cercana según `grid.nearestFree` (§8); `pathState=PATH_QUEUED` y se encola (`movement.enqueue(eid)`) salvo que ya estuviera `PATH_QUEUED` (en ese caso solo cambia la meta, conserva su puesto en la cola); `pathCount=pathIdx=0`, `stuck=0`, `repathAt=0`.
5. `stop`: `orderKind=NONE`, `velX=velY=0`, `pathState=IDLE`, `pathCount=pathIdx=0`. Si estaba en cola, la entrada se invalida (la cola valida `pathState===QUEUED` al desencolar).
6. Los comandos solo se aplican en el **primer tick de un turno** (`tick % TURN_TICKS === 0`).

### 6. Datos de entrada de la sim (`packages/shared/src/simdata.ts`)

La sim no importa `@reinos/data` (que no puede importar `shared`). El puente es un objeto de enteros definido en `shared` y construido por un adaptador en `data`:

```ts
export interface MovementTuning {
  // todos enteros; viven en packages/data/json/game.json bloque "movement"
  pathBudgetPerTick: number; // solicitudes de ruta resueltas por tick
  arriveDistFx: Fx; // llegada exacta a la meta
  groupArriveDistFx: Fx; // llegada "suficiente" si stuck >= stuckTicks
  stuckTicks: number; // ticks sin progreso antes de declarar atasco
  repathCooldownTicks: number; // ticks mínimos entre re-rutas de una unidad
  separationPermille: number; // peso de la separación, 1000 = 1.0
  neighborRangeFx: Fx; // radio de consulta de vecinos (suma de radios + margen)
}
export interface SimData {
  dataVersion: string; // DATA_VERSION con el que se construyó
  unitIds: readonly string[]; // typeId = posición en units.json (orden de archivo)
  speedFxPerTick: readonly number[]; // round(speed * fixedScale / TICKS_PER_SECOND), calculado en la carga
  radiusFx: readonly number[]; // por clase (max de sus clases) desde movement.radiusFxByClass / defaultRadiusFx
  hpFx: readonly number[]; // hp * fixedScale
  movement: MovementTuning;
}
```

- `packages/data` añade el bloque `movement` a `game.json` (Zod `strict`, enteros, incluye `radiusFxByClass` y `defaultRadiusFx` que solo consume el adaptador), exporta `buildSimData(data: GameData): SimData` (`packages/data/src/simdata.ts`) y **sube `DATA_VERSION` a `0.2.0`**. Los floats de `units.json` (`speed` en casillas/s) se convierten **solo ahí** (permitido: no es código de sim). Un test en `tools/headless` comprueba que `buildSimData(loadGameData())` es asignable a `SimData`.
- Valores de afinación (`stuckTicks`, separación, presupuesto…) **no** son constantes mágicas en `sim`: viven en `movement`. Constantes **estructurales** (no de balance) sí viven en código: `TURN_TICKS`, `SECTOR_SIZE = 16`, `MAX_WAYPOINTS = 64`, `MAX_CMD_UNITS = 1024`.

### 7. Configuración de partida (`packages/shared/src/simconfig.ts`)

```ts
export interface MapSpec {
  width: number; // casillas, 1..512
  height: number; // casillas, 1..512
  blockedRle: number[]; // longitudes de tramos alternos en orden fila-mayor, empezando por LIBRE; suma = width*height
}
export interface SpawnSpec {
  unit: string;
  owner: number;
  x: Fx;
  y: Fx;
} // unit = id de units.json
export interface SimConfig {
  maxPlayers: number; // 1..8
  maxEntities: number; // 1..65535 (default 4096)
  map: MapSpec;
  spawns: SpawnSpec[]; // se crean en orden de array antes del tick 0
}
```

Los `spawns` se aplican en `createSim` en el orden del array (eids resultantes deterministas). F1 no tiene comando de spawn: la producción llega en F3. Una unidad con spawn sobre casilla bloqueada es error de configuración (`createSim` lanza).

### 8. Loop y API pública de la sim (`packages/sim/src/loop/`, re-exportado desde `packages/sim/src/index.ts`)

```ts
export interface TurnResult {
  tick: number;
  turn: number;
  hash: number;
  rejected: number;
}
export interface Sim {
  readonly world: World;
  readonly grid: Grid;
  readonly tick: number; // ticks completados
  readonly turn: number; // trunc(tick / TURN_TICKS) = turno que se ejecutará a continuación
  step(commands: readonly Command[]): TurnResult; // avanza EXACTAMENTE un turno (TURN_TICKS ticks)
  stepTick(commands?: readonly Command[]): void; // avanza un tick; commands solo permitidos si tick % TURN_TICKS === 0 (si no, RangeError)
  hash(): number;
  hashFull(): number;
}
export function createSim(seed: number, dataVersion: string, config: SimConfig, data: SimData): Sim;
```

- `createSim` lanza si `dataVersion !== data.dataVersion`, si `seed` no es uint32, si algún `spawn.unit` no está en `data.unitIds`, o si la config es inválida. PRNG de partida: `createPrng(seed)` (`shared/prng.ts`); en F1 la sim puede no consumirlo, pero su estado entra al hash.
- `step(cmds)` ≡ `stepTick(cmds)` seguido de `TURN_TICKS - 1` × `stepTick()`; luego calcula `hash()`. Precondición: `tick % TURN_TICKS === 0`.
- **Orden de sistemas dentro de un tick (fijo)**:
  1. Si `tick % TURN_TICKS === 0`: sistema de comandos (§5).
  2. Snapshot: `prevX/prevY ← posX/posY` para toda entidad viva.
  3. `grid.flush()`: reconstruye los sectores sucios en orden ascendente de índice de sector.
  4. `movement.update(tick)`, que internamente hace en este orden: (a) resolver hasta `pathBudgetPerTick` solicitudes de la cola FIFO; (b) reconstruir el hash espacial desde `prevX/prevY`; (c) steering + colisiones.
  5. `tick++`.
- **Jacobi**: el steering lee posiciones solo de `prevX/prevY` y de la rejilla y escribe solo `posX/posY/velX/velY/facing/stuck/pathIdx/orderKind/pathState` de la entidad que procesa; así el resultado no depende del orden de procesamiento salvo por el desempate explícito por `eid` ascendente.
- **Interfaz con movimiento** (`packages/sim/src/systems.ts`; es el punto de desacoplo B ↔ C):
  ```ts
  export interface MovementSystem {
    enqueue(eid: number): void; // llamado por el sistema de comandos; la cola es FIFO
    clearCaches(): void; // para el test de transparencia de cachés
    update(tick: number): void; // pasos 4(a..c)
  }
  export type MovementFactory = (w: World, grid: Grid, data: SimData) => MovementSystem;
  ```
  `createSim` acepta un quinto parámetro opcional `opts?: { movement?: MovementFactory }`; por defecto usa `createMovementSystem` de `sim/src/steer/index.ts`. T0 deja ahí un **stub** (línea recta sin colisión) para que B sea testeable sin C; C reemplaza el archivo completo. B no edita `grid/`, `path/` ni `steer/`; C no edita `ecs/`, `commands/` ni `loop/`.
- Rendimiento: ninguna asignación en los bucles por tick en régimen estacionario (buffers preasignados); `step` puede asignar al ordenar comandos.

### 9. Formato de repetición (`packages/shared/src/replay.ts`)

```ts
export const REPLAY_FORMAT_VERSION = 1;
export interface ReplayTurn {
  n: number;
  cmds: Command[];
} // n = turno de ejecución (0-based)
export interface Replay {
  version: typeof REPLAY_FORMAT_VERSION;
  seed: number; // uint32
  dataVersion: string;
  config: SimConfig;
  totalTurns: number; // turnos a simular; los turnos sin comandos se omiten de `turns`
  turns: ReplayTurn[]; // n estrictamente ascendente, cmds no vacío, cada cmd.turn === n, n < totalTurns
  finalHash: number; // sim.hashFull() tras totalTurns turnos
  checkpoints?: [number, number][]; // [turno completado, sim.hash()] cada K turnos (K a elección del grabador); ayuda a localizar el primer desync
}
export function validateReplay(x: unknown): Replay; // lanza Error con ruta del campo inválido; enteros, rangos, orden, validateCommandShape por comando
export function serializeReplay(r: Replay): string; // JSON canónico: claves en el orden de arriba, sin espacios sobrantes; byte-reproducible
```

- `validateReplay` no usa `JSON.parse` (prohibido en `shared` por lint:sim); el **parseo** vive en `tools/headless/src/replay-io.ts` (`readReplay(path)` = `validateReplay(JSON.parse(text))`).
- `finalHash` usa `hashFull()`; los `checkpoints` usan `hash()` por ser baratos.
- Una repetición se considera la misma partida si `version`, `seed`, `dataVersion`, `config` y `turns` coinciden. El grabador debe ordenar los comandos de un turno como los entregó al `step` (el resultado no depende de ello, ver §5.1).
- Ejecución: `runReplay(replay: Replay, data: SimData): { finalHash: number; checkpoints: [number, number][]; ok: boolean }` en `packages/sim/src/loop/replay-run.ts` (crea la sim, alimenta `step` turno a turno, compara con `finalHash` y checkpoints). Es lo que ejecutan Node y navegadores.
- Compatibilidad: subir `REPLAY_FORMAT_VERSION` ante cualquier cambio de tablas, de `HASHED_COLUMNS`, del orden de sistemas o de la semántica de comandos. No se mantienen repeticiones antiguas en F1.

### 10. Rejilla, pathfinding y steering

Archivos: `packages/sim/src/grid/`, `path/`, `steer/`. Dueño: tarea C. Coordenadas: casilla `(tx, ty)` enteras, `tx = fxToTile(x)`; índice lineal `ty * width + tx`.

**Grid (`grid/index.ts`)**

```ts
export const SECTOR_SIZE = 16;
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly sectorsX: number;
  readonly sectorsY: number; // ceil(width/16), ceil(height/16); sectores de borde pueden ser menores
  readonly terrain: Uint8Array; // 0 libre, 1 bloqueado (agua profunda, acantilado, etc.)
  readonly occ: Uint8Array; // nº de huellas de edificio que cubren la casilla (0 = libre)
  version: number; // +1 en cada cambio que altera la transitabilidad
  isBlocked(tx: number, ty: number): boolean; // terrain|occ != 0, o fuera de mapa (true)
  setTerrain(tx: number, ty: number, blocked: boolean): void;
  occupyRect(tx: number, ty: number, w: number, h: number): void;
  releaseRect(tx: number, ty: number, w: number, h: number): void;
  sectorOf(tx: number, ty: number): number; // sy * sectorsX + sx
  nearestFree(tx: number, ty: number, out: { tx: number; ty: number }): boolean;
  flush(): void; // reconstruye grafo de sectores sucios, en orden ascendente
}
export function createGrid(width: number, height: number): Grid;
export function loadMap(grid: Grid, map: MapSpec): void; // decodifica blockedRle
```

- Terreno y edificios se mantienen separados: liberar un edificio no desbloquea terreno bloqueado. Los edificios en F1 solo los usan tests y el escenario (no hay comando de construcción hasta F3).
- `nearestFree`: búsqueda por anillos de Chebyshev de radio 0, 1, 2…; dentro de un anillo, recorrido fila-mayor (y ascendente, luego x ascendente); devuelve la primera casilla libre. `false` si no hay ninguna.
- Unidades **no** bloquean la rejilla (eso es colisión de steering, no transitabilidad).

**Hash espacial (`grid/spatial.ts`)**: `createSpatialHash(grid, capacity)` con `rebuild(w: World)` (ordenación por conteo, desde `prevX/prevY`, en orden ascendente de ranura) y `query(tx, ty)` que expone `[start, end)` sobre un `Int32Array` de ranuras. El orden de los vecinos dentro de una casilla es ascendente por ranura, y las casillas se consultan en orden fila-mayor.

**Pathfinding (`path/index.ts`)**

```ts
export const PATH_NONE = 0,
  PATH_OK = 1,
  PATH_PARTIAL = 2,
  PATH_TRUNCATED = 3;
export interface PathQuery {
  startX: Fx;
  startY: Fx;
  goalX: Fx;
  goalY: Fx;
}
export interface PathResult {
  status: number; // PATH_*
  count: number; // waypoints escritos en x[0..count)
  x: Int32Array;
  y: Int32Array; // longitud MAX_WAYPOINTS, reutilizables (sin asignar por consulta)
}
export interface Pathfinder {
  findPath(q: PathQuery, out: PathResult): void;
  clearCaches(): void;
  readonly stats: { queries: number; cacheHits: number; expandedNodes: number }; // solo diagnóstico, no es estado
}
export function createPathfinder(grid: Grid): Pathfinder;
export function createPathResult(): PathResult;
```

Semántica de `findPath` (el contrato de comportamiento; el algoritmo interno es de C):

- Entrada con meta o inicio en casilla bloqueada: inicio y meta se reubican con `nearestFree` antes de buscar. Waypoints: **centros de casilla** salvo el último, que es la meta exacta cuando `PATH_OK`. El punto de partida **no** se incluye.
- `PATH_OK`: existe ruta; `count >= 1`. `PATH_PARTIAL`: meta inalcanzable; la ruta lleva a la casilla alcanzable más cercana a la meta (distancia octil; empate: menor índice lineal) y `count >= 1` (o `0` si ya está allí). `PATH_NONE`: inicio aislado sin movimiento posible, `count = 0`. `PATH_TRUNCATED`: la ruta suavizada supera `MAX_WAYPOINTS`; se devuelven los primeros 64 y el llamador re-pide ruta al agotarlos.
- Conectividad de 8 vecinos **sin cortar esquinas** (un movimiento diagonal exige las dos casillas ortogonales libres). Costos enteros: ortogonal 10, diagonal 14; heurística octil admisible: `10*max(dx,dy) + 4*min(dx,dy)`.
- Orden de vecinos fijo: N, E, S, O, NE, SE, SO, NO. Lista abierta: montículo binario con clave total `(f, h, índice de nodo)` ascendente; no hay empates sin resolver.
- **Jerárquico**: sectores de 16×16; portales = tramos libres maximales sobre cada borde compartido entre sectores adyacentes (un nodo por tramo, en su casilla central; con longitud par, la de menor índice lineal); aristas intra-sector con costo calculado por A\* local acotado al sector; búsqueda de alto nivel sobre portales + inicio/meta; refinado a nivel de casilla por sector. Rutas dentro de un mismo sector o a ≤ 2 sectores pueden usar A\* plano. Suavizado ("string pulling") por línea de visibilidad sobre la rejilla con DDA entera.
- **Cachés** (transparentes, §4): grafo de sectores reconstruido incrementalmente por `grid.flush()` solo para sectores sucios y sus vecinos; caché de rutas de alto nivel por `(sectorInicio, sectorMeta, grid.version)`. Flow fields por sector (GDD §15.2) quedan **fuera de F1** (ver Consecuencias).
- `stats` no entra en ningún hash.

**Steering (`steer/index.ts`)**

```ts
export const createMovementSystem: MovementFactory; // implementa MovementSystem (§8)
```

Comportamiento exigido (los coeficientes viven en `SimData.movement`):

- Cada unidad con `orderKind=MOVE` sigue `wp[pathIdx]` a `speedFxPerTick[typeId]`; avanza `pathIdx` al llegar a `arriveDistFx` del waypoint (o a distancia ≤ radio si el siguiente es visible). Al agotar waypoints: si `PATH_FOLLOW` y la meta no está a `arriveDistFx`, vuelve a encolar (respetando `repathAt = tick + repathCooldownTicks`); si `PATH_FOLLOW_PARTIAL`, la orden termina (`orderKind=NONE`, `velX=velY=0`).
- Llegada: distancia a la meta ≤ `arriveDistFx`, **o** `stuck >= stuckTicks` y distancia ≤ `groupArriveDistFx` → orden terminada.
- Separación entre unidades (suma de radios + margen `neighborRangeFx`) y deslizamiento contra casillas bloqueadas por separación de ejes. Invariante verificable en tests: **ninguna unidad ocupa nunca una casilla bloqueada** tras un tick, y tras reposar (sin órdenes durante 100 ticks) no hay pares con solape > 50% del menor radio.
- Desempate por `eid` ascendente; todo cálculo en enteros (`fixed.ts`).
- `stuck` aumenta cuando el desplazamiento del tick es < 1/4 de `speedFxPerTick` mientras hay orden; se pone a 0 en caso contrario.

### 11. Dónde viven los archivos y quién los edita

| Ruta                                                                                                  | Contenido                                  | Dueño                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| `packages/shared/src/fixed.ts`, `trig-tables.ts`, `tools/gen-trig.mjs`                                | §1–2                                       | A                                      |
| `packages/shared/src/commands.ts`, `simconfig.ts`, `simdata.ts`, `replay.ts`, `index.ts` (re-exports) | §5–7, §9                                   | T0 crea tipos; B4 completa `replay.ts` |
| `packages/data/json/game.json` (`movement`), `packages/data/src/simdata.ts`, `DATA_VERSION`           | §6                                         | T0                                     |
| `packages/sim/src/ecs/{columns,world,hash,index}.ts`                                                  | §3–4                                       | B                                      |
| `packages/sim/src/commands/{validate,system,index}.ts`                                                | §5                                         | B                                      |
| `packages/sim/src/loop/{sim,replay-run,index}.ts`, `packages/sim/src/systems.ts`                      | §8–9                                       | B                                      |
| `packages/sim/src/grid/{grid,map,spatial,index}.ts`                                                   | §10                                        | C                                      |
| `packages/sim/src/path/{sectors,astar,hpa,queue,index}.ts`                                            | §10                                        | C                                      |
| `packages/sim/src/steer/{steer,index}.ts`                                                             | §10 (stub inicial de T0)                   | C                                      |
| `packages/sim/src/index.ts`                                                                           | re-exporta `createSim`, tipos, `runReplay` | B                                      |
| `tools/headless/src/**`, `tools/headless/browser/**`                                                  | runner, escenario, bench                   | D, E                                   |

`packages/sim/package.json` ya depende de `@reinos/shared`; no depende de `@reinos/data`. Prohibido `import` desde `tools/*` en paquetes.

## Alternativas consideradas

- **Ids sin generación (índice puro):** más simple, pero un comando que llega para una unidad muerta cuya ranura se reutilizó actuaría sobre otra unidad; la generación en el id lo evita sin coste en hot loops.
- **`step` por tick con comandos libres:** rompe el invariante de lockstep (los comandos entran al inicio del turno); se mantiene `stepTick` solo para render/depuración con la restricción de límite de turno.
- **Float para trigonometría con redondeo:** descartado por ADR-003.
- **Flow fields por sector en F1:** GDD §15.2 los menciona, pero PLAN F1 solo pide A\* jerárquico + steering. Se difieren hasta que el bench de grupos grandes lo exija.
- **Constantes de movimiento en código:** viola la regla "valores solo en data"; se mueven a `game.json.movement`.
- **Spawns/mapa fuera de la repetición:** la repetición dejaría de ser autocontenida (seed + dataVersion + comandos); se incluyen en `config`.

## Consecuencias

- A y B/C pueden trabajar en paralelo contra tipos y stubs de T0; las únicas dependencias de código son `fixed.ts` (constantes y funciones de §2) y `MovementSystem`/`MovementFactory` (§8).
- Bump de `DATA_VERSION` a `0.2.0`; regenerar `packages/data` tests y `COVERAGE.md` si lista el bloque.
- Un cambio en cualquier tabla trigonométrica, en `HASHED_COLUMNS`, en el orden de sistemas, en el algoritmo de desempate de A\* o en la semántica de comandos rompe repeticiones: exige subir `REPLAY_FORMAT_VERSION` y re-pinear los hashes dorados (`tools/headless/golden/hashes.json`).
- Límites duros que hay que vigilar: `maxEntities ≤ 65535`, `|operando| ≤ 2^20` en `fxMul/fxDiv`, coordenadas no negativas; 64 waypoints por unidad (2 MiB de columnas a 4096 unidades).
- Los flow fields por sector, formaciones, cola con Shift, `payload` tipado y objetivo `entity` quedan para fases posteriores; añadirlos exige enmendar §5 y §10.
- El hash por turno cubre las columnas de §4; un desync en datos no hasheados (waypoints) solo se detecta con `hashFull()` o cuando diverge una columna hasheada: la repetición de F1 usa `hashFull()` al final.

## Estado

Propuesto (pendiente de aceptación por `architect` tras revisión de B1/B2 y T0; ver `docs/progress/fase-01/plan.md`).

## Enmiendas (ola 1: T0, A, B)

Cambios respecto al texto original, hechos al implementar; ninguno altera la intención del contrato.

1. **§2 `atan2Idx`**: la razón se **redondea** al 1/256 más cercano, `i = trunc((min*512 + max) / (2*max))`, en lugar de truncarla. Con truncado el error llega a ~1,14 pasos y no cumple "error <= 1 paso" (medido en 10^5 pares); redondeada, el error medido es <= 1. Las tablas no cambian (hashes pineados: `SIN_QUARTER` 0x776254e3, `ATAN_OCTANT` 0xc02d19d7, combinado 0x1ee20c51).
2. **§2** `fixed.ts` exporta además `MAX_COORD_FX = 512_000`. `fxMul/fxDiv/mulDiv` se implementan con división truncada exacta `(p - p % c) / c` y nunca devuelven `-0`. `isqrt` es Newton entero (sin `Math.sqrt`, ni `Math.floor`).
3. **§3/§4 columnas**: `World` añade `freeSlots: Uint16Array` y `freeTop` (pila LIFO de ranuras libres). `columns.ts` exporta tres listas: `HASHED_COLUMNS` (por entidad, en orden de hash; el `eid` derivado se hashea antes), `HASHED_SCALARS` (`count`) y `UNHASHED_COLUMNS` (incluye `capacity`, `highWater`, `freeSlots`, `freeTop`). El test exige que cada campo de `World` esté en exactamente una.
4. **§5**: `shared` exporta también `commandShapeError` (motivo textual), `MAX_EID`, `MAX_PLAYERS`, `validateSimConfig` y las constantes `MAX_ENTITIES_LIMIT`, `DEFAULT_MAX_ENTITIES`, `MAX_MAP_SIDE`. Un `move` cuya meta no tiene casilla libre en todo el mapa se omite (sin orden).
5. **§8**: `TurnResult.turn` es el turno recién ejecutado (0-based); `Sim` añade `clearCaches()`; `createSim` acepta `opts?: { movement?, grid? }` (`grid` = `GridFactory`). Como `grid/` y `steer/` son de la ola 2, la ola 1 deja `Grid`, `MovementSystem`, `MovementFactory` y un movimiento en línea recta (`createStubMovement`) en `sim/src/systems.ts`, y una rejilla mínima en `sim/src/loop/stub-grid.ts`. La ola 2 debe pasar a usar `grid/` y `steer/createMovementSystem` como valores por defecto de `createSim`. `loadMap` es la línea base y no incrementa `grid.version`.
6. **§9**: `runReplay(replay, data, opts?)` acepta `{ checkpointEvery, movement, grid }` y devuelve además `firstDivergentCheckpoint` (turno completado del primer checkpoint distinto, o `null`). Si un checkpoint de la repetición no se alcanza, `ok` es `false`. `validateReplay` devuelve una copia canónica; `checkpoints` debe ser estrictamente ascendente.
7. **§6**: `buildSimData` devuelve `BuiltSimData` (gemelo estructural de `SimData`, porque `data` no importa `shared`); el test de asignabilidad vive en `packages/data/test/simdata.test.ts` (importa `shared` por ruta relativa, solo en test) y no en `tools/headless`.
