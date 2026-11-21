# ADR-007: Economía, construcción, producción, eras, tecnologías y generador de mapas (Fase 3)

Estado: **Propuesto** (2026-11-21, `architect`; pasa a Aceptado tras la revisión de contrato por `reviewer`/`sim-engineer` al cerrar T0). Contexto: PLAN Fase 3, GDD §4, §5, §6, §7.1, §11, §13.2–13.3, §17.2; ADR-003 (punto fijo), ADR-005 (ECS, comandos, loop, repetición; **aceptado**), ADR-006 (cliente; **aceptado**), `docs/contracts.md`, `docs/progress/fase-03/plan.md` (tareas y carriles).

## Contexto

La sim de Fase 1–2 solo conoce unidades que se mueven: `World` tiene una columna `typeId` que indexa `units.json`, `SimConfig` solo trae `spawns` de unidades y `blockedRle`, `SimData` solo trae velocidad, radio y PV por unidad, y `Command` solo sabe `move`/`stop`. La Fase 3 añade el bucle económico completo de Eras I–II. Para que 5 carriles trabajen en paralelo (sim/economía A, sim/recolección B, sim/mapgen, data, cliente/UI, cliente/render, assets, QA) este ADR fija **columnas, comandos, orden de sistemas, datos, snapshot, hash/replay y propiedad de carpetas**. Cualquier desviación requiere enmendar este ADR antes de mergear.

Convenciones: "Fx" = 1/1000 de casilla (ADR-005); **"µ" = 1/1 000 000 de unidad de recurso** (`RES_SCALE`, §2); un **tick** = 50 ms (20 Hz); "eid" = id de entidad de 31 bits (ADR-005 §3); "permille"/"ppm" = milésimas/millonésimas enteras. Todo código de `packages/sim` y `packages/shared` pasa `pnpm lint:sim` (sin `/` salvo `Math.trunc(a / b)` o los helpers de `shared/fixed.ts`, sin `Math.floor/round/sqrt`, sin `Map`/`Set` iterados sin orden). Productos intermedios `< 2^53` se resuelven con `mulDiv(a, b, c)` (división truncada exacta de `shared/fixed.ts`).

## Decisión

### 1. Alcance de la Fase 3: qué entra, qué se difiere

Qué está "activo" es **dato**, no código: `game.json.scope` (§3.1) lista ids habilitados. La sim rechaza comandos sobre ids fuera de alcance (motivo `not_enabled`), el HUD los oculta y el generador de mapas **genera** todo lo del script pero solo **materializa** (§12.6) lo habilitado. Así, activar una cosa en una fase posterior no cambia el mapa generado.

| Área                       | Entra en F3                                                                                                                      | Se difiere (con nota)                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recursos                   | Víveres, madera, éter, piedra; depósito; carga; tasas de §4.3                                                                    | Fragmentos Coronales (necesitan Custodio, F7): el generador los coloca (§12) pero no se materializan                                                                                                                                                        |
| Fuentes                    | **Ovejas** (pastoreo), **bayas**, **granjas** (búfer, resiembra), **tala**, **minería de éter**, **cantera**, **caza de ciervo** | **Jabalí**: se coloca en el mapa (cuenta para la equidad) pero **no se materializa**; atraerlo exige combate/IA (F4/F5, PLAN F5 "atracción de jabalí"). **Pesca/trampas de peces/Puerto/pesquero**: agua y naval (F7). Cadáveres por unidades militares: F4 |
| Edificios                  | Ciudadela, Casa, Molino, Aserradero, Campamento minero, Granja, Cuartel, Establo, Atalaya (9)                                    | Puerto, empalizadas, puertas, torres, murallas, Portón (defensa/naval, F4–F7); Arquería, Forja, Mercado (construibles solo cuando exista su función: Arquería F4, Forja F4, Mercado F7); Eras III–IV                                                        |
| Unidades entrenables       | Colono (Ciudadela), Recluta (Cuartel), Batidor (Establo)                                                                         | El resto (F4+). Los combatientes se pueden crear y mover pero no pelean                                                                                                                                                                                     |
| Eras                       | I y II (`scope.maxAge = 2`): requisitos, costo, tiempo, bloqueo de la Ciudadela, bonus de PV por era                             | III–IV (F7); bonus de armadura por era se **almacena** como derivado pero no se usa hasta F4                                                                                                                                                                |
| Tecnologías                | Económicas I–II: Jubón acolchado, Carretilla, Hacha templada, Yugo, Picos de éter, Picos de piedra (6)                           | El resto (III–IV, forja, etc.)                                                                                                                                                                                                                              |
| Mercado, tributo, comercio | —                                                                                                                                | F7 (precios compartidos, carreta)                                                                                                                                                                                                                           |
| Guarnición                 | **No hay** guarnición, flechas extra ni campana (el GDD §8.5 las liga al combate)                                                | F4. **No se añade ninguna columna de guarnición en F3**                                                                                                                                                                                                     |
| Visión                     | Sigue en el **cliente** (ADR-006 §7.1). Los edificios aportan visión al `VisionGrid` del cliente                                 | Migra a la sim en F4 (deuda ya anotada en STATUS). La regla "no construir en casillas no exploradas" (GDD §6) se aplica **solo en la UI** en F3; la sim valida lo determinista (terreno, ocupación, recursos, unidades ajenas)                              |
| Daño                       | Un **golpe de caza** mínimo contra ciervos (§10.4), no es el sistema de combate                                                  | Fórmula de daño, armaduras, proyectiles: F4 (el golpe de caza se reemplaza entonces)                                                                                                                                                                        |
| Facciones                  | Sin bonus de facción (todas las partidas usan valores base)                                                                      | F7                                                                                                                                                                                                                                                          |

Nota sobre "12 edificios" (PLAN §5, ejemplo de devlog): el alcance real son **9 construibles** (+ Ciudadela inicial). El texto del PLAN es ilustrativo; no es criterio de fase. Se anota como decisión D1 abajo.

### 2. Escalas y unidades de punto fijo

```ts
// packages/shared/src/resources.ts (nuevo; constantes de unidades, NO de balance)
export const RES_SCALE = 1_000_000; // 1 unidad de recurso = 1_000_000 µ
export const RES_COUNT = 4; // índices fijos = orden de resources.json
export const RES_FOOD = 0,
  RES_WOOD = 1,
  RES_AETHER = 2,
  RES_STONE = 3;
export const STOCK_MAX = 1_000_000_000; // tope de stock por recurso (enteros de unidades enteras)
export const PPM = 1_000_000; // multiplicadores en partes por millón
```

- **Stock de jugador**: unidades **enteras** (`Int32`). Todo costo es entero.
- **Cantidades de fuente, carga, acumuladores de tala/minería/rot, deuda de reparación**: en **µ** (`Int32`; 35 unidades = 35 000 000 µ cabe; el tope práctico de una fuente es 800 000 000 µ < 2^31).
- **Tasas**: `rateMicroPerTick = roundHalfUp(perSecond × 1_000_000 / 20)` (en `buildSimData`, único lugar con floats). Ej. 0,43/s → 21 500 µ/tick; 0,31/s → 15 500 µ/tick: **sin sesgo de redondeo** (con `Fx` de 1/1000 habría error de 2,3 %).
- **Tiempos**: `ticks = roundHalfUp(seconds × 20)` en `buildSimData`.
- **Modificadores**: `mul_pct` se convierte a ppm: `ppm = 1_000_000 + pct × 10_000` y se **combinan multiplicando** (GDD §4.3: `Π m_tecnología`) en orden de índice de tecnología ascendente: `acc = mulDiv(acc, ppmFactor, 1_000_000)`. `add` se suma. Aplicar: `eff = mulDiv(base, accPpm, 1_000_000)`.

### 3. Datos (`packages/data`, dueño `content-designer`)

#### 3.1 Cambios de JSON (todo valor nuevo con `notes` y marca **AMBIGUO** cuando el GDD no lo da)

| Archivo                        | Bloque nuevo/cambiado                                                                                                                                   | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `economy.json`                 | `start`                                                                                                                                                 | `stock` inicial por defecto. **AMBIGUO** (GDD §3.2 solo dice "recursos iniciales" configurables): `{food:200, wood:200, aether:100, stone:200}` (estándar de referencia AoE2). Es uno de los parámetros **calibrables** (§14)                                                                                                                                                                                                                                                                                                         |
| `economy.json`                 | `sources[]` ampliado                                                                                                                                    | cada fuente gana `kind: "tile"\|"entity"\|"building"`, `gatherRate: <id de gatherRates>`, `carry: "default"\|"hunt"`, y entran `tree` (`kind:tile`, `resource:wood`, `gatherRate:tala`, `amount: 100` **AMBIGUO**: el GDD no da madera por árbol), `berries` (`tile`, `bayas`), `aether_vein` (`tile`, `mineria_eter`), `quarry` (`tile`, `cantera`), `sheep` (`entity`, `pastoreo`), `deer` (`entity`, `caza`, `carry:hunt`, `hp: 5` **AMBIGUO**, `huntable: true`), `boar` (`huntable: false` en F3), `farm` (`building`, `granja`) |
| `economy.json`                 | `farm`                                                                                                                                                  | añade `maxGatherers` (**AMBIGUO**; recomendado 2: `bufferRatePerSecond 0,4` sostiene ≈ 1,25 granjeros de 0,32/s) y `reseed: { costFromBuilding: true }`                                                                                                                                                                                                                                                                                                                                                                               |
| `economy.json`                 | `tuning` (nuevo)                                                                                                                                        | `reachFx` (distancia a la que un colono "llega" a su objetivo: 1500), `searchRadiusTiles` (12), `searchBudgetPerTick` (8), `maxPathFailures` (3), `autoBuildRadiusTiles` (8), `sheepCapturePeriodTicks` (20), `autoGatherAfterBuild` (mapa `buildingId → [fuente...]`: `aserradero:[tree]`, `molino:[berries,farm]`, `campamento_minero:[aether_vein,quarry]`, `granja:[farm]`)                                                                                                                                                       |
| `economy.json`                 | `construction` extra                                                                                                                                    | `foundationRefundPct: 100` (se devuelve `costo × (1 − progreso)`; **AMBIGUO**)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `buildings.json`               | `ciudadela.dropsOff` = los 4 recursos (faltaba); `granja.walkable: true` (campo nuevo, default `false`); `ciudadela`/`aserradero`… sin cambios de costo | el GDD dice que la Ciudadela es depósito de todo (centro urbano)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `game.json`                    | `scope` (nuevo)                                                                                                                                         | `{ id:"fase_3", maxAge:2, buildings:[...9], units:["colono","recluta","batidor"], techs:[...6], sources:["tree","berries","aether_vein","quarry","sheep","deer","farm"] }`; cada id fuera de lista queda "no habilitado" y su `deferredTo` va en `notes`                                                                                                                                                                                                                                                                              |
| `game.json`                    | `production` (nuevo)                                                                                                                                    | `queueMax: 15`, `batchOnShift: 5`, `popPerUnit: 1` (el GDD no da costo en población: 1 por unidad)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `game.json`                    | `mapgen` (nuevo)                                                                                                                                        | parámetros del generador que el GDD no fija (geometría, no balance): `circleRadiusPct`, `jitterPct`, `hillRadius:[min,max]`, `groupSpread`, `relaxMax`, `maxAttempts: 16`, `fairness: { tolerancePct: 5, radiusTiles: 30, resources:[food,wood,aether,stone] }` (el 5 % es del GDD §11.1)                                                                                                                                                                                                                                             |
| `maps/llanuras_de_ceniza.json` | `objects` completado                                                                                                                                    | el script del §11.4 es "ejemplo"; se añaden **solo** lo que §4.4 especifica y el ejemplo omite: ciervo (3–4, dist 14–30), bayas (6, dist 8–10, `group:6`), 2 vetas de 4 casillas a 18–26, canteras de 5 y 4 casillas a 10–24, 4 ovejas extra a 14–30. Los campos del ejemplo no se alteran (el test compara contra el literal del GDD)                                                                                                                                                                                                |
| `schemas/maps.ts`              | `MapObject`                                                                                                                                             | acepta `count: [min,max]`, `tiles`, `group` y `dist` por placement                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `DATA_VERSION`                 | `0.2.1 → 0.3.0`                                                                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

`COVERAGE.md` se actualiza con los AMBIGUO nuevos. Cambiar cualquier valor **del GDD** exige ADR; cambiar un AMBIGUO propio de la Fase 3 (arriba) solo exige nota en el devlog de calibración (§14).

#### 3.2 `SimData` v2 (contrato `shared` ↔ `data`)

`SimData` conserva los campos de la capa 1 y añade la capa 2. `buildSimData` es el **único** lugar con floats; devuelve solo enteros. Los ids se resuelven a **índices** (orden de archivo) y las listas "por unidad/edificio/tecnología" son arrays paralelos indexados por ese índice.

```ts
// packages/shared/src/simdata.ts (T0-S declara la interfaz; D2 la implementa)
export interface SimData {
  // ---- capa 1 (sin cambios) ----
  dataVersion: string;
  unitIds: readonly string[];
  speedFxPerTick: readonly number[];
  radiusFx: readonly number[];
  hpFx: readonly number[];
  movement: MovementTuning;
  // ---- capa 2 (nueva, SIM_DATA_HASH_LAYOUT = 2) ----
  unitEco: {
    cost: readonly number[]; // [u*4 + r], unidades enteras
    trainTicks: readonly number[];
    building: readonly number[]; // buildingIdx que la produce
    age: readonly number[];
    enabled: readonly number[]; // 0/1 (scope)
    isSettler: readonly number[]; // 0/1
    losTiles: readonly number[]; // units.json los (captura de ovejas)
    strikeDamageFx: readonly number[]; // attacks.melee * 1000 (golpe de caza)
    strikeIntervalTicks: readonly number[]; // reload * 20
  };
  buildings: {
    ids: readonly string[];
    w: readonly number[];
    h: readonly number[];
    cost: readonly number[]; // [b*4 + r]
    buildTicks: readonly number[];
    hpFxByAge: readonly number[]; // [b*4 + (age-1)]; edades sin dato = última edad listada
    age: readonly number[];
    popProvided: readonly number[];
    dropsMask: readonly number[]; // bit r = acepta recurso r
    walkable: readonly number[]; // 0/1 (granja = 1)
    requiresBuilding: readonly number[]; // buildingIdx o -1 (granja → molino)
    enabled: readonly number[];
    losTiles: readonly number[]; // visión del edificio (atalaya; otros 0): el cliente la lee
  };
  tileKinds: {
    // código en el mapa = índice + 1 (0 = nada)
    ids: readonly string[]; // ["tree","berries","aether_vein","quarry"]
    amountMicro: readonly number[];
    resource: readonly number[];
    rate: readonly number[];
    enabled: readonly number[];
  };
  resTypes: {
    // entidades kind=RESOURCE: sheep, deer, boar
    ids: readonly string[];
    amountMicro: readonly number[];
    rotMicroPerTick: readonly number[];
    hpFx: readonly number[];
    radiusFx: readonly number[];
    rate: readonly number[];
    carryHunt: readonly number[];
    huntable: readonly number[];
    enabled: readonly number[];
  };
  rates: { microPerTick: readonly number[]; resource: readonly number[] }; // orden de economy.gatherRates
  economy: {
    carryDefaultMicro: number;
    carryHuntMicro: number;
    farm: {
      bufMaxMicro: number;
      bufRefillMicroPerTick: number;
      hitPermille: number;
      amountMicro: number;
      maxGatherers: number;
    };
    startStock: readonly number[]; // [4]
    popPerUnit: number;
    popLimitDefault: number;
    queueMax: number;
    batchOnShift: number;
    reachFx: number;
    searchRadiusTiles: number;
    searchBudgetPerTick: number;
    maxPathFailures: number;
    autoBuildRadiusTiles: number;
    sheepCapturePeriodTicks: number;
    autoGatherAfterBuild: readonly number[]; // [b*4 + k] = código tileKind/res (+1) o 0
    construction: {
      numerator: number;
      offset: number;
      repairFirstMicroHpPerTick: number;
      repairExtraMicroHpPerTick: number;
      repairCostPct: number;
      foundationRefundPct: number;
    };
  };
  ages: {
    costs: readonly number[];
    researchTicks: readonly number[]; // [a*4 + r] / [a]
    reqCount: readonly number[];
    reqMask: readonly number[]; // alternativas OR: pares (count, máscara de buildingIdx)
    reqStart: readonly number[];
    excludedMask: readonly number[];
    blocksSettlerQueue: number;
    maxAge: number;
  };
  techs: {
    ids: readonly string[];
    building: readonly number[];
    age: readonly number[];
    cost: readonly number[];
    ticks: readonly number[];
    requiresMask: readonly number[];
    enabled: readonly number[];
    fxStart: readonly number[];
    fxCount: readonly number[];
    fxStat: readonly number[];
    fxOp: readonly number[];
    fxSubjKind: readonly number[];
    fxSubj: readonly number[];
    fxValue: readonly number[];
  };
}
```

Reglas de construcción: (a) `fxSubjKind ∈ {UNIT, BUILDING, RESOURCE, GLOBAL}`; los selectores `line:`/`class:`/`buildings:all` se **expanden** a filas por unidad/edificio al construir; (b) `fxValue` es entero: `hp add` en Fx, `carry add` en µ, `farm_amount add` en µ, `mul_pct` en **porcentaje entero** (si no es entero, `data:check` falla); (c) una tecnología **habilitada** con una `stat` fuera de `{hp, armor_melee, armor_pierce, speed, carry, gather_rate, farm_amount, build_speed, research_speed, production_speed}` o con `valueByAge`/`script` falla `data:check` (las demás stats se admiten solo en tecnologías no habilitadas); (d) `simDataHash` (capa 2) pliega **todos** los campos nuevos en el orden declarado, arrays con prefijo de longitud, strings con prefijo de longitud y valores no enteros lanzan `RangeError`; `SIM_DATA_HASH_LAYOUT` pasa de 1 a **2**.

#### 3.3 Verificaciones de datos (`pnpm data:check`)

Cada edificio/unidad/tecnología/fuente en `scope` existe y tiene los campos necesarios; `ciudadela` acepta los 4 recursos; todo `objects[].type` del script existe en `economy.sources` o es `crown_shard`; `scope.techs` solo con stats soportadas; `production.queueMax ≤ MAX_QUEUE` (§4.4); `techs.length ≤ 128`; `buildings.ids.length ≤ 255`.

### 4. ECS: tipos de entidad y columnas nuevas

#### 4.1 Tipos de entidad

Una columna `kind: Uint8` distingue el **espacio de `typeId`**:

| `kind` | Constante       | `typeId` indexa         | Ejemplos                                 |
| ------ | --------------- | ----------------------- | ---------------------------------------- |
| 0      | `KIND_UNIT`     | `SimData.unitIds`       | colono, batidor, recluta                 |
| 1      | `KIND_BUILDING` | `SimData.buildings.ids` | ciudadela, granja, cimientos de casa     |
| 2      | `KIND_RESOURCE` | `SimData.resTypes.ids`  | oveja, ciervo (jabalí no se materializa) |

`owner`: jugadores `0..maxPlayers-1`; `OWNER_NEUTRAL = 255` para ciervos y ovejas sin capturar. **Los árboles, bayas, vetas y canteras NO son entidades**: son una capa por casilla (§4.3) para no consumir ranuras (un bosque tiene ~1 200 casillas con 22 grupos; `maxEntities` ≤ 65 535).

Un edificio es una entidad con `posX/posY` = **centro de su huella** (Fx) y ancla `(bTx, bTy)` = casilla superior izquierda; la huella es `buildings.w × buildings.h` desde el ancla.

#### 4.2 Columnas por entidad (todas en `World`, inicializadas a 0, puestas a 0 en `despawn`)

Se añaden a `HASHED_COLUMNS` **después de `stuck`, en este orden**:

| #   | Columna     | Tipo | Significado                                                                                                           |
| --- | ----------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| 15  | `kind`      | U8   | tabla 4.1                                                                                                             |
| 16  | `task`      | U8   | estado de tarea del colono (§7)                                                                                       |
| 17  | `tgtEid`    | I32  | eid objetivo (entidad de recurso, edificio a construir/reparar, depósito en curso) o 0                                |
| 18  | `tgtTile`   | I32  | casilla objetivo `ty*width+tx + 1` o 0                                                                                |
| 19  | `aux`       | I32  | depósito elegido (eid) o, en `SEARCH`, casilla excluida `+1`                                                          |
| 20  | `carryKind` | U8   | 0 nada; `r+1` recurso cargado                                                                                         |
| 21  | `carry`     | I32  | µ cargados (≤ capacidad)                                                                                              |
| 22  | `work`      | I32  | acumulador de trabajo en µ (golpe de granja, temporizador de golpe de caza en ticks); en edificios: flag `popBlocked` |
| 23  | `fails`     | U8   | fallos de ruta consecutivos                                                                                           |
| 24  | `bState`    | U8   | `BSTATE_NONE=0`, `FOUNDATION=1`, `COMPLETE=2`                                                                         |
| 25  | `bProgress` | I32  | progreso de obra en "milésimas de tercio-tick" (§8)                                                                   |
| 26  | `bTx`       | U16  | ancla x                                                                                                               |
| 27  | `bTy`       | U16  | ancla y                                                                                                               |
| 28  | `resAmount` | I32  | µ restantes (oveja, ciervo, granja)                                                                                   |
| 29  | `farmBuf`   | I32  | µ en el búfer invisible de la granja                                                                                  |
| 30  | `resFlags`  | U8   | animales: 1 vivo, 2 cadáver; granja: 0                                                                                |
| 31  | `qCount`    | U8   | elementos en la cola de producción (0..`MAX_QUEUE`)                                                                   |
| 32  | `qProgress` | I32  | progreso del elemento de la cabeza, en milésimas de tick (`+1000` por tick base)                                      |
| 33  | `rallyKind` | U8   | 0 ninguno, 1 posición, 2 entidad, 3 casilla de recurso                                                                |
| 34  | `rallyX`    | I32  | Fx x (posición) o `tile+1` (casilla)                                                                                  |
| 35  | `rallyY`    | I32  | Fx y                                                                                                                  |
| 36  | `rallyEid`  | I32  | eid (rally a entidad)                                                                                                 |

Arrays por entidad **de tamaño fijo** (hasheados dentro del bucle de entidades, solo los `qCount` primeros): `qKind: Uint8Array(capacity*MAX_QUEUE)` (`Q_UNIT=1`, `Q_TECH=2`, `Q_AGE=3`), `qId: Uint16Array(capacity*MAX_QUEUE)` (typeId de unidad / índice de tecnología / edad destino). `MAX_QUEUE = 16` es una constante **estructural** (como `MAX_WAYPOINTS`), no de balance; el límite jugable (15) está en datos.

**No hasheadas (derivadas, recalculables; van a `UNHASHED_COLUMNS` y a `hashFull` solo si afectan decisiones):** `hpMax: Int32Array` (PV máximos: base de unidad + tecnologías; edificio: `hpFxByAge[edad del dueño]`), `speed: Int32Array` (Fx/tick efectivos = base × ppm de tecnologías; **el movimiento lee `w.speed[i]` en lugar de `data.speedFxPerTick[typeId]`** — cambio mínimo de una línea en `steer/`, ver §15), `bBuilders: Uint8Array` (colonos construyendo/reparando este tick; se pone a 0 y se recuenta cada tick).

`spawn(w, init)` se extiende con `kind` (y `hpMax`, `speed`). El test de `ecs.test.ts` que exige que cada campo de `World` figure en exactamente una lista sigue vigente.

#### 4.3 Estado a nivel de mundo

```ts
// sim/src/ecs/world.ts (T0-S declara; E1 implementa)
export interface PlayerArrays {
  // longitud maxPlayers (≤ 8), todo Int32/Uint
  stock: Int32Array; // [p*4 + r] unidades enteras
  age: Uint8Array; // 1..4
  popUsed: Int32Array; // reservada al comenzar a entrenar la cabeza de cola + unidades vivas
  popCap: Int32Array; // Σ popProvided de edificios COMPLETE del jugador, tope popLimit
  popLimit: Int32Array; // de PlayerSpec
  techBits: Uint32Array; // [p*TECH_WORDS + w]; TECH_WORDS = 4 (128 tecnologías)
  debt: Int32Array; // [p*4 + r] µ de reparación pendiente de cobrar
}
export interface TileLayers {
  tileResKind: Uint8Array; // [ty*w+tx]: 0 nada; k+1 → tileKinds.ids[k]
  tileResAmt: Int32Array; // µ restantes
  placeOcc: Uint8Array; // cuenta de huellas de edificios (incluye granjas)
  resVersion: number; // +1 cuando cambia algún `tileResKind` (agotado)
  resSum: number; // Σ tileResAmt (int32 con envoltura), actualizado incrementalmente
}
```

Además, **contadores de auditoría** (no hasheados, solo para tests y devlog): `gathered[p*4+r]`, `spent[p*4+r]`, `refunded[p*4+r]`, `trained[p]`, en µ/unidades enteras. El test de conservación exige `stock_final = stock_inicial + depositado − gastado + reembolsado`.

`grid.occ` (caminabilidad) y `placeOcc` (colocación) son **capas distintas**: los edificios no caminables llaman `grid.occupyRect/releaseRect` **y** incrementan `placeOcc`; las **granjas** (`walkable`) solo incrementan `placeOcc` (los granjeros caminan sobre ellas y los anillos de granjas alrededor del Molino no encierran a nadie); los recursos de casilla (árbol, bayas, veta, cantera) ponen `grid.setTerrain(tx,ty,true)` y se liberan con `setTerrain(...,false)` al agotarse. Invariante testeada: `grid.occ` y `placeOcc` se reconstruyen idénticos desde las entidades vivas (`rebuildOccupancy`), y `placeOcc` entra en `hashFull`.

### 5. Hash de estado v3 (`REPLAY_FORMAT_VERSION` 2 → 3)

Orden exacto de `hashState` (extiende ADR-005 §4):

```
h = FNV_OFFSET_BASIS
h = int32(h, tick); int32(h, world.count); int32(h, grid.version); int32(h, prng[0..3])
for i in 0..highWater-1, alive[i]===1, ascendente:
  eid, <las 14 columnas de ADR-005>, <las 22 columnas nuevas 15..36 en orden>,
  para k in 0..qCount[i]-1: qKind[i*MAX_QUEUE+k], qId[i*MAX_QUEUE+k]
for p in 0..maxPlayers-1:   stock[p*4+0..3], age[p], popUsed[p], popCap[p], techBits[p*4+0..3], debt[p*4+0..3]
int32(h, resVersion); int32(h, resSum)
return h >>> 0
```

`hashStateFull` añade (después de lo anterior): `hashBytes(placeOcc)`, `hashBytes(tileResKind)` y el hash int32 de `tileResAmt` ascendente. `hashFull` sigue incluyendo `grid.terrain/occ`.

**Cambios de formato y re-pineo controlado (obligatorio):**

| Qué                          | Antes        | Después                                                  | Por qué                                                      |
| ---------------------------- | ------------ | -------------------------------------------------------- | ------------------------------------------------------------ |
| `REPLAY_FORMAT_VERSION`      | 2            | **3**                                                    | `SimConfig`, `Command`, `HASHED_COLUMNS` y semántica cambian |
| `SIM_DATA_HASH_LAYOUT`       | 1            | **2**                                                    | `SimData` capa 2                                             |
| `DATA_VERSION`               | `0.2.1`      | **`0.3.0`**                                              | datos de §3                                                  |
| `SNAPSHOT_VERSION` (cliente) | 1            | **2**                                                    | columnas de §13                                              |
| Golden `thousand`            | `0x9f6e57a6` | **nuevo valor pineado**, `golden.json` `formatVersion 2` | el hash pliega más columnas                                  |

Re-pineo en 3 pasos, sin excepciones: (1) **antes** de tocar `ecs/` se congela `LEGACY_HASHED_COLUMNS_V2` y una función de prueba `hashStateLegacyV2` (solo en `tools/headless/test` o `sim/test`) que reproduce el hash de ADR-005; (2) test de **equivalencia**: el escenario `thousand` ejecutado con la sim v3 debe dar `hashStateLegacyV2 == 0x9f6e57a6` y los mismos 25 checkpoints antiguos (prueba que el **comportamiento** de movimiento no cambió; solo cambia la función de hash); (3) recién entonces se pinean los nuevos `finalHash`/checkpoints de v3 en `golden.json` y se añaden los goldens nuevos (`village`, `mapgen`, §14). Cambiar el golden sin el test (2) verde está **prohibido**. La verificación entre entornos sigue siendo Node, Node `--jitless`, Chromium principal y Chromium Worker (Firefox/WebKit solo en CI; STATUS 2/4).

### 6. `SimConfig` v2 y arranque de partida

```ts
// packages/shared/src/simconfig.ts
export interface PlayerSpec {
  startAge: number /*1..4*/;
  stock: [number, number, number, number];
  popLimit: number;
}
export type SpawnSpec =
  | { kind: 'unit'; id: string; owner: number; x: Fx; y: Fx }
  | { kind: 'building'; id: string; owner: number; tx: number; ty: number; complete: boolean } // ancla; complete=true: Ciudadela inicial
  | { kind: 'animal'; id: string; x: Fx; y: Fx }; // neutral: oveja/ciervo
export interface MapSpec {
  width: number;
  height: number;
  blockedRle: number[];
  resRle: number[];
}
//   resRle: pares [código tileKind (0 = nada), longitud] en orden fila-mayor; Σ longitudes = width*height; cada casilla con recurso NO puede estar en blockedRle
export interface SimConfig {
  maxPlayers: number;
  maxEntities: number;
  map: MapSpec;
  players: PlayerSpec[];
  spawns: SpawnSpec[];
  simDataHash?: number;
}
```

`createSim` (nuevos pasos, en este orden determinista): validar config → crear `Grid` (terreno) → aplicar `resRle` (puebla `tileResKind/tileResAmt` con `tileKinds.amountMicro[k]` y marca `setTerrain(true)`) → inicializar `PlayerArrays` desde `players[]` (si `stock` es todo ceros se usa `economy.startStock`) → crear `spawns` **en el orden del arreglo** (edificio completo ⇒ ocupa huella, suma `popProvided`, `hp = hpMax`; animal ⇒ `owner = NEUTRAL`, `resAmount`, `resFlags = 1` si `huntable`, 0 si oveja) → `popUsed` = unidades vivas del jugador. `createSim` lanza si un spawn cae en casilla bloqueada/ocupada o si el id no existe / no está habilitado.

El **mapa es explícito en la repetición** (`replay.config`): una repetición no depende de la versión del generador (§12). `Replay` conserva el resto de ADR-005 §9; `validateReplay` valida `config` v2 y los comandos v3 (§9).

### 7. Orden de sistemas dentro de un tick (extiende ADR-005 §8; **fijo**)

1. `tick % 4 === 0` → **comandos** (§9).
2. Snapshot `prevX/prevY ← posX/posY`.
3. `grid.flush()`.
4. **`economy.update(tick)`** — sub-orden fijo, todo por índice de ranura ascendente:
   a. poner `bBuilders[*] = 0`;
   b. recuentos: para cada colono en `BUILD_WORK`/`REPAIR_WORK` con objetivo válido y adyacente, `bBuilders[obj]++`;
   c. **producción**: edificios con `qCount > 0`: avanzar cabeza, completar entrenamiento / tecnología / era;
   d. **obra y reparación**: edificios `FOUNDATION` avanzan progreso; edificios `COMPLETE` con reparadores recuperan PV;
   e. **granjas y cadáveres**: relleno de búfer; podredumbre de cadáveres;
   f. captura de ovejas (cada `sheepCapturePeriodTicks`);
   g. **tareas de colonos** (máquina de estados de §8): acumulación de recolección, depósito, búsquedas con presupuesto, `requestMove`;
5. `movement.update(tick)` (ADR-005 §8.4: cola de rutas, hash espacial, steering).
6. `tick++`.

Las tareas (4g) corren **antes** del movimiento para que una orden de movimiento nueva entre en la cola de rutas del mismo tick; la detección de llegada usa el resultado del movimiento del tick anterior. Ningún sistema de economía lee posiciones salvo `prevX/prevY` (Jacobi).

### 8. Máquina de estados del colono y recolección

#### 8.1 Estados (`task`)

`TASK_IDLE=0`, `GATHER_WALK=1`, `GATHER_WORK=2`, `DROP_WALK=3`, `BUILD_WALK=4`, `BUILD_WORK=5`, `REPAIR_WALK=6`, `REPAIR_WORK=7`, `SEARCH=8`, `TASK_FLEE=9` (reservado F4, no se usa).

Reglas generales: solo unidades con `unitEco.isSettler` ejecutan tareas; `move`/`stop` ponen `task = IDLE` y limpian `tgtEid/tgtTile/aux/fails` (**no** vacían `carry`); una tarea de recurso **distinto** del que se carga descarta la carga (`carryKind` distinto ⇒ `carry = 0`), igual que AoE2.

**Mover desde una tarea** usa `requestMove(w, grid, movement, i, eid, goalX, goalY)`, extraída de `commands/system.ts` a `commands/move.ts` (misma lógica que el comando `move`, incluida la cola FIFO de rutas). **Llegada**: `orderKind === ORDER_NONE` y distancia Chebyshev de la casilla del colono a la huella/casilla objetivo ≤ 1, o `dist(pos, centro objetivo) ≤ reachFx`. Si el movimiento terminó sin llegar o `pathState === PATH_FAILED`, `fails++` y se re-emite; con `fails ≥ maxPathFailures` ⇒ `SEARCH` excluyendo esa casilla/entidad (`aux`).

**Casilla de aproximación** `approachTile(huella, desde)`: casillas libres (`!grid.isBlocked`) del anillo de 1 casilla alrededor de la huella; se elige la de menor `distSq` a la posición del colono, desempate por `(ty, tx)` ascendente. Si no existe ⇒ el candidato se descarta.

#### 8.2 Transiciones

| Estado                       | Condición                                | Siguiente                                                                                   | Efecto                                                                                           |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GATHER_WALK`                | llegó                                    | `GATHER_WORK`                                                                               | `work = 0`                                                                                       |
| `GATHER_WORK`                | `carry ≥ cap`                            | `DROP_WALK`                                                                                 | elige depósito (§8.4); `requestMove` a su casilla de aproximación                                |
| `GATHER_WORK`                | objetivo agotado/muerto                  | `SEARCH` (si `carry == 0`) o `DROP_WALK` (si `carry > 0`; tras depositar vuelve a `SEARCH`) | evento `EV_RES_DEPLETED`                                                                         |
| `DROP_WALK`                  | llegó                                    | `GATHER_WALK` (mismo objetivo) o `SEARCH`                                                   | **depósito instantáneo**: `stock += trunc(carry / RES_SCALE)` y `gathered += carry`; `carry = 0` |
| `DROP_WALK`                  | no hay depósito válido                   | `IDLE`                                                                                      | evento `EV_NO_DEPOT`                                                                             |
| `SEARCH`                     | hay candidato                            | `GATHER_WALK`                                                                               | (§8.3)                                                                                           |
| `SEARCH`                     | sin candidato                            | `IDLE` (tras depositar la carga si la hay)                                                  | evento `EV_SETTLER_IDLE`                                                                         |
| `BUILD_WALK` / `REPAIR_WALK` | llegó                                    | `BUILD_WORK` / `REPAIR_WORK`                                                                |                                                                                                  |
| `BUILD_WORK`                 | cimiento completo                        | auto-continuar (§8.6)                                                                       |                                                                                                  |
| `REPAIR_WORK`                | PV al máximo, o sin recursos para cobrar | `IDLE`                                                                                      | evento                                                                                           |

Un `eid` objetivo no vivo (`!isAlive`) se trata como agotado: **nunca** falla.

#### 8.3 Búsqueda (presupuesto determinista)

Por tick se procesan **hasta `searchBudgetPerTick`** colonos en `SEARCH`, en orden de ranura ascendente (sin cola oculta: el estado es solo `task`/`aux`, que está hasheado). Candidatos del **mismo tipo de fuente** que el objetivo anterior: escaneo cuadrado de radio `searchRadiusTiles` alrededor de la casilla del colono, mínima `distSq`, desempate `(ty, tx)` ascendente, excluyendo `aux − 1`; las fuentes-entidad (oveja/ciervo/granja) se consultan en orden de ranura y se rankean por `distSq` y luego `eid`. Candidato válido = existe `approachTile` y, si es granja, `gatherers < maxGatherers` (recuento por escaneo de colonos con `tgtEid`, O(colonos)).

#### 8.4 Capacidad, tasa y depósito

- `cap(µ) = mulDiv(base, carryMulPpm[p][settler], PPM) + carryAdd` con `base = carryDefaultMicro` o `carryHuntMicro` según la fuente.
- Cada tick en `GATHER_WORK`: `eff = mulDiv(rate.microPerTick[idx], gatherMulPpm[p][recurso], PPM)`; `take = min(eff, cap − carry, restante)`; `carry += take`; se descuenta `take` de la fuente (capa de casilla o `resAmount`). `carryKind = recurso`.
- **Depósito**: el edificio propio `COMPLETE` más cercano (distancia Chebyshev entre la posición del colono y la huella; desempate eid ascendente) cuyo `dropsMask` contiene el recurso. Cálculo O(edificios del jugador) solo al llenarse la carga.
- **Granja** (`work` como acumulador): cada tick `farmBuf += min(bufRefill, bufMax − farmBuf, resAmount)` y `resAmount −= ese relleno`; el granjero acumula `work += eff`; al alcanzar `hit = mulDiv(cap, hitPermille, 1000)` toma `min(hit, farmBuf)` del búfer (si no alcanza, toma lo disponible y conserva el `work`). Granja con `resAmount == 0 && farmBuf == 0` queda **agotada** (evento `EV_FARM_EXHAUSTED`, granjeros → `SEARCH`); se **resiembra** con el comando `reseed` (§9; cuesta el costo de construcción).
- `farm_amount` de las tecnologías afecta a granjas **construidas o resembradas después** (decisión D6; GDD no precisa).

#### 8.5 Animales

- **Oveja**: neutral al inicio. Cada `sheepCapturePeriodTicks`, para cada oveja neutral en orden de ranura y cada unidad con `losTiles > 0` en orden de ranura, `dx² + dy² ≤ losTiles²` (casillas) ⇒ `owner = dueño de la unidad` (primera coincidencia; no se recaptura). Es la implementación en sim de "se capturan por visión", sin depender del `VisionGrid` del cliente. No se pudre ni se mueve; se cosecha directamente a tasa de `pastoreo`, carga por defecto (10).
- **Ciervo** (`huntable`): neutral, estático y pasivo en F3 (no huye ni contraataca), `resFlags = 1`, `hp` de datos. Un colono adyacente en `GATHER_WORK` sobre un ciervo vivo **no recolecta**: acumula `work` (ticks) y cada `strikeIntervalTicks` (colono: 40) resta `strikeDamageFx` (colono: 3000) a `hp`; con `hp ≤ 0` ⇒ `resFlags = 2` (cadáver). Los cadáveres pierden `rotMicroPerTick` por tick (ciervo 0,25/s = 12 500 µ/tick) y se cosechan a tasa de `caza`, carga `carryHuntMicro` (35). **Es una primitiva provisional de F3**, no el sistema de combate; F4 la sustituye por el pipeline de daño (nota en el plan de F4).
- **Jabalí**: no se materializa (§1).

#### 8.6 Auto-continuación

Al terminar una obra, cada colono de esa obra: (1) si hay otro cimiento propio no completo a `≤ autoBuildRadiusTiles`, lo ayuda (el más cercano, desempate `eid`); (2) si no, toma la primera fuente disponible de `autoGatherAfterBuild[edificio]`; (3) si no, `IDLE`. Para colocar varios edificios con Shift (GDD §13.3) el cliente emite **un `build` por edificio** con el mismo conjunto de colonos; no hay cola de órdenes en la sim (diferida, ADR-005).

### 9. Comandos v3 (`packages/shared/src/commands.ts`; REPLAY_FORMAT_VERSION 3)

`Command` mantiene las 6 claves exactas (`turn, playerId, type, unitIds, target, payload`); `unitIds` pasa a significar "**eids actores**" (colonos, edificios o entidades según el comando; se conserva el nombre para no romper repeticiones del cliente). Cambia el tipo de `target` y `payload`:

```ts
export type CommandType =
  | 'move'
  | 'stop'
  | 'gather'
  | 'build'
  | 'repair'
  | 'train'
  | 'set_rally'
  | 'research'
  | 'advance_age'
  | 'cancel_queue'
  | 'delete'
  | 'reseed';
export const COMMAND_CODE = {
  move: 1,
  stop: 2,
  gather: 3,
  build: 4,
  repair: 5,
  train: 6,
  set_rally: 7,
  research: 8,
  advance_age: 9,
  cancel_queue: 10,
  delete: 11,
  reseed: 12,
} as const; // 13–15 reservados (garrison, ungarrison, attack)
export interface PosTarget {
  kind: 'pos';
  x: Fx;
  y: Fx;
}
export interface EntityTarget {
  kind: 'entity';
  eid: number;
}
export interface TileTarget {
  kind: 'tile';
  tx: number;
  ty: number;
}
export type Target = PosTarget | EntityTarget | TileTarget | null;
export type Payload =
  | null
  | { b: number; tx: number; ty: number }
  | { u: number; n: number }
  | { t: number }
  | { slot: number };
```

| `type`            | `unitIds` (actores)              | `target`                                                                      | `payload`                         | Semántica (en `sim/src/commands`, orden `playerId` ascendente y llegada estable)                                                                                                                       |
| ----------------- | -------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `move`            | unidades                         | `pos`                                                                         | `null`                            | ADR-005 §5 + limpia `task`                                                                                                                                                                             |
| `stop`            | unidades                         | `null`                                                                        | `null`                            | ADR-005 §5 + `task = IDLE`                                                                                                                                                                             |
| `gather`          | colonos                          | `tile` (árbol/bayas/veta/cantera) o `entity` (oveja/ciervo/granja `COMPLETE`) | `null`                            | fuente habilitada, existe; `task = GATHER_WALK`, `fails = 0`; no-colonos se omiten (`skippedUnits++`)                                                                                                  |
| `build` (colocar) | colonos                          | `tile` (ancla)                                                                | `{b, tx, ty}` con `tx,ty` = ancla | valida §10.1; **crea el cimiento** y cobra; todos los colonos válidos → `BUILD_WALK`                                                                                                                   |
| `build` (ayudar)  | colonos                          | `entity` (cimiento propio)                                                    | `null`                            | `BUILD_WALK` hacia el cimiento                                                                                                                                                                         |
| `repair`          | colonos                          | `entity` (edificio propio `COMPLETE` con `hp < hpMax`)                        | `null`                            | `REPAIR_WALK`                                                                                                                                                                                          |
| `train`           | **edificios** propios `COMPLETE` | `null`                                                                        | `{u, n}`, `1 ≤ n ≤ batchOnShift`  | `unitEco.building == typeId`, `unit.age ≤ edad`, habilitada, `qCount + n ≤ queueMax`, cobra `n × costo` al encolar (todo o nada por edificio)                                                          |
| `set_rally`       | edificios                        | `pos`, `entity` (recurso/granja/cimiento) o `tile`                            | `null`                            | actualiza `rally*`                                                                                                                                                                                     |
| `research`        | edificio propio `COMPLETE`       | `null`                                                                        | `{t}`                             | `techs.building == typeId`, `techs.age ≤ edad`, habilitada, requisitos, no investigada ni en alguna cola del jugador; cobra; encola `Q_TECH`                                                           |
| `advance_age`     | Ciudadela propia `COMPLETE`      | `null`                                                                        | `null`                            | requisitos de era (§11), `edad + 1 ≤ maxAge`, no hay `Q_AGE` en las colas del jugador; cobra; encola `Q_AGE`                                                                                           |
| `cancel_queue`    | edificio                         | `null`                                                                        | `{slot}`                          | quita el elemento (reembolso 100 % del costo pagado); si era la cabeza reinicia `qProgress` y, si era de unidad con población reservada, la libera                                                     |
| `delete`          | unidades o edificios propios     | `null`                                                                        | `null`                            | unidad: `despawn` (libera población). Cimiento: reembolso `costo × (1 − progreso)` (`foundationRefundPct`). Edificio completo: sin reembolso; libera huella, `popCap`, cola (reembolso de lo encolado) |
| `reseed`          | granjas propias agotadas         | `null`                                                                        | `null`                            | cobra costo de construcción; `resAmount = farmAmount(jugador)`                                                                                                                                         |

**Rechazo:** un comando se rechaza entero (cuenta en `TurnResult.rejected` y emite `EV_CMD_REJECTED{a: código de comando, b: motivo}`) si falla forma, turno, jugador o `payload` inválido para su tipo. Dentro de un comando válido cada actor se procesa en orden ascendente y se **omite** si no está vivo, no es del jugador o no cumple (`skippedUnits++`). **Motivos** (`b`): 1 `no_such_entity`, 2 `not_owner`, 3 `not_enabled`, 4 `age_too_low`, 5 `cant_afford`, 6 `requirement_missing`, 7 `invalid_placement`, 8 `queue_full`, 9 `tech_unavailable`, 10 `no_builders`, 11 `bad_target`, 12 `not_complete`, 13 `not_depleted`. Los costos se descuentan **secuencialmente** en el orden de aplicación (un comando temprano puede dejar sin recursos a uno posterior del mismo turno; es determinista).

`validateCommandShape` / `commandShapeError` se extienden con una tabla por tipo (claves exactas por `target.kind` y por forma de `payload`; enteros en rango: `b < 255`, `u < 65535`, `n ≤ 64`, `t < 128`, `slot < MAX_QUEUE`, `tx,ty < MAX_MAP_SIDE`). El relay (F9) reutiliza esas funciones sin cambios.

### 10. Construcción, reparación y eliminación

#### 10.1 Colocación (`shared/src/placement.ts`, función pura **compartida por sim y cliente**)

```ts
export interface PlacementQuery {
  width: number;
  height: number;
  terrainBlocked(tx: number, ty: number): boolean; // terreno bloqueado o recurso de casilla
  placeOcc(tx: number, ty: number): number;
  foreignOrNeutralEntityOn(tx: number, ty: number): boolean; // animales o unidades ajenas
}
export function placementError(
  q: PlacementQuery,
  w: number,
  h: number,
  tx: number,
  ty: number,
): number; // 0 = válida; si no, motivo
```

La sim la llama con un adaptador sobre `World`+`Grid`; **el cliente la llama con un adaptador sobre el snapshot + capas del mensaje `tiles`** para pintar el fantasma válido/inválido sin ida y vuelta al Worker (misma función ⇒ misma respuesta). Reglas deterministas: huella dentro del mapa; ninguna casilla con `terrainBlocked` ni `placeOcc > 0`; sin entidades ajenas/neutrales en la huella (las propias se desalojan); `buildings.requiresBuilding` (granja ⇒ el jugador tiene un Molino `COMPLETE`); era; costo. **No** se comprueba niebla/exploración (solo UI, §1).

#### 10.2 Cimiento, progreso y PV

Al colocar: se cobra el costo, se crea la entidad `KIND_BUILDING` con `bState = FOUNDATION`, `bProgress = 0`, `hp = 1000` (1 PV), `hpMax = hpFxByAge[…]`, se llama `occupyRect` (salvo `walkable`) y se incrementa `placeOcc`; las unidades **propias** dentro de la huella reciben una orden `move` (`requestMove`) a `grid.nearestFree` calculado **después** de ocupar (orden de eid ascendente). Test obligatorio: ninguna unidad queda atrapada dentro de una huella ocupada.

Fórmula de GDD §6 en enteros (`t_real = 3t/(n+2)`, con `numerator = 3` y `offset = 2` de `combat.json.construction`): `need = numerator × 1000 × buildTicks`; con `n` colonos en `BUILD_WORK` el progreso por tick es `inc = mulDiv((n + offset) × 1000, 1000 + buildSpeedPermille, 1000)`. Un colono tarda exactamente `buildTicks` (`inc = 3000`), dos el 75 % (`inc = 4000`), cuatro el 50 % (`inc = 6000`); el tiempo total es `ceil(need / inc)` en ticks (`Math.trunc((need + inc − 1) / inc)`). `need` máximo (Faro Celeste, 3 500 s) = 2,1·10^8 < 2^31. `hp = max(1000, mulDiv(hpMax, bProgress, need))` mientras crece; al `bProgress ≥ need` ⇒ `bState = COMPLETE`, `hp = hpMax`, `popCap[dueño] += popProvided`, evento `EV_BUILDING_DONE`, y la granja recibe `resAmount = farmAmount`.

#### 10.3 Reparación

Con `n ≥ 1` reparadores: `µPV/tick = repairFirstMicroHpPerTick + (n − 1) × repairExtraMicroHpPerTick` (GDD: 750 y 375 PV/min ⇒ 625 000 y 312 500 µPV/tick); se acumulan en `work` del edificio y `hp += trunc(work / 1000)` (Fx = 1/1000 PV). **Costo**: por cada PV ganado se acumula deuda en µ por recurso `debt[p*4+r] += mulDiv(costMicro[r] × repairCostPct, hpGainFx, 100 × hpMaxFx)` (GDD: de 1 PV al máximo = 50 % del costo original); cada vez que `debt ≥ RES_SCALE` se cobra la parte entera del stock; si no alcanza, la reparación se detiene (`REPAIR_WORK → IDLE`, evento). Asedio/barcos al 25 %: F4.

#### 10.4 Eliminación y población

`popUsed` = unidades vivas del jugador + **reserva** de la cabeza de cola de unidad ya iniciada. Una unidad sale de `popUsed` al morir/`delete`. `popCap` = `min(popLimit, Σ popProvided de edificios COMPLETE del jugador)`; al destruir/eliminar un edificio se recalcula (la sim **no** mata unidades por superar el tope).

### 11. Producción, eras y tecnologías

**Cola** (`qCount ≤ queueMax`, por edificio). Solo la cabeza avanza: `qProgress += 1000 × productionSpeedPpm / PPM` por tick; se completa al alcanzar `trainTicks × 1000` (o `techs.ticks`, `ages.researchTicks`). Al **iniciar** una cabeza `Q_UNIT` se reserva población: si `popUsed + popPerUnit > popCap` la cola espera (`work = 1`, evento `EV_POP_BLOCKED` solo al entrar en bloqueo). Al completar: la unidad aparece en la `spawnTile` (anillo de 1 casilla de la huella, libre, mínima `distSq` al rally —o al centro si no hay—, desempate `(ty,tx)`; sin casilla libre la cola espera y emite `EV_QUEUE_BLOCKED`), con `hp = hpMax` y la orden del rally: colono con rally a recurso ⇒ `gather`; resto ⇒ `move`.

**Eras:** `advance_age` encola `Q_AGE`. Requisito (cualquiera de las alternativas OR de `ages.reqStart..`): hay **≥ `count` tipos de edificio distintos** `COMPLETE` del jugador dentro de la máscara y fuera de `excludedMask` (decisión D2: "2 edificios" = 2 **tipos** distintos, como la referencia AoE2; AMBIGUO en GDD §5). Mientras una Ciudadela tiene `Q_AGE` en su cola no entrena colonos (la cola es secuencial: `ciudadelaBlocksSettlersWhileResearching`); otra Ciudadela sí. Al completar: `age[p]++`, y para cada edificio propio `COMPLETE` ascendente `hp += hpMaxNuevo − hpMaxViejo` (mantiene el daño recibido; el bonus de PV por era es del GDD §5), evento `EV_AGE_DONE`. El bonus de armadura por era queda en datos (F4).

**Tecnologías como modificadores genéricos:** al completar una `Q_TECH` se activa su bit en `techBits` y se **recomputan desde cero** las tablas derivadas del jugador iterando `techBits` ascendente (resultado independiente del orden de investigación): `gatherMulPpm[p*4+r]`, `carryMulPpm[p*U+u]`, `carryAdd[p*U+u]`, `speedMulPpm[p*U+u]`, `hpAdd[p*U+u]`, `farmAmountAdd[p]`, `buildSpeedPermille[p]`, `researchSpeedPpm[p]`, `productionSpeedPpm[p]`. Estas tablas son **derivadas** (no hasheadas; test: recomputar tras `clearCaches` da el mismo `hashFull`). `speed`/`hpMax` por entidad se refrescan para unidades vivas del jugador (`hp += hpAdd`, ascendente por ranura). La investigación es una cola más: costo al encolar, reembolso al cancelar.

### 12. Generador de mapas (`packages/sim/src/mapgen/`, sin DOM, sujeto a `lint:sim`)

#### 12.1 API

```ts
export const MAPGEN_VERSION = 1;
export interface MapGenParams {
  seed: number;
  scriptId: string;
  players: number;
  side: number;
} // side ∈ game.mapSizes
export interface GeneratedMap {
  width: number;
  height: number;
  terrain: Uint8Array; // clase de presentación (índices de game.terrain: grass,dirt,sand,snow,ash,...)
  elevation: Uint8Array; // 0..maxHeight; en F3 NO afecta a la sim (±25 % y −10 % de subida: F7)
  tileRes: Uint8Array; // código tileKind por casilla (árbol=1, bayas=2, veta=3, cantera=4)
  blocked: Uint8Array; // lagos/acantilados (si el script los pide); Llanuras de Ceniza: ninguno
  starts: { tx: number; ty: number }[]; // centro de la Ciudadela de cada jugador
  animals: { id: string; tx: number; ty: number }[]; // oveja/ciervo/jabalí (neutrales)
  shards: { tx: number; ty: number }[]; // Fragmentos Coronales (no se materializan en F3)
  fairness: FairnessReport;
  attempts: number;
  seedUsed: number;
  mapGenVersion: number;
}
export function generateMap(p: MapGenParams, script: MapScriptSim, data: SimData): GeneratedMap;
export function toSimConfig(
  m: GeneratedMap,
  opts: { maxEntities?: number },
  data: SimData,
): SimConfig; // materializa lo habilitado (§12.6)
export function mapHash(m: GeneratedMap): number; // FNV-1a de todas las capas y listas en orden fijo
```

`MapScriptSim` (en `shared/src/mapscript.ts`) es el espejo **solo-enteros** del `MapScript` de `data` (porcentajes y rangos ya son enteros en el GDD §11.4); `@reinos/data` exporta `buildMapScript(raw)` y un test de asignabilidad. Así `sim` no importa `@reinos/data` (contracts.md). El generador se ejecuta **en el cliente** (hilo principal o worker) **antes** de `init`; el resultado entra a la sim como `SimConfig` explícito. Cada cliente multijugador ejecuta el mismo generador con (semilla, script, jugadores, lado); la sala compara `mapHash` (obligación para F9).

#### 12.2 Aleatoriedad (regla central)

Cada etapa usa su **propio flujo**: `createPrng(hashInts([seedUsed, STAGE_TAG]))` con `STAGE_TAG` fijo por etapa (`PLAYERS=1, LANDS=2, ELEVATION=3, CLIFFS=4, TERRAIN=5, CONNECT=6, OBJECTS=7`). Cambiar o añadir una etapa no altera el flujo de las demás. El **ruido de valor** es una función pura de `(seedUsed, tag, gx, gy)` con `hashInts` sobre la malla entera e interpolación entera (smoothstep en 1/1024), **independiente del orden de consumo del PRNG**. La sim de la partida usa `createPrng(seed)` por separado (su estado inicial entra al hash); el generador **no** consume ese PRNG (un generador distinto no desplaza el estado de la partida).

#### 12.3 Etapas (GDD §11.1; las que el script no pide se omiten y se registran como `skipped`)

1. **Jugadores:** `P` inicios en círculo de radio `circleRadiusPct %` del lado, ángulo `k × 1024 / P + offset` (tablas `sinT/cosT`), jitter `±jitterPct %`; 1v1 ⇒ opuestos. Cada inicio reserva un cuadrado de 6×6 para la Ciudadela 4×4 + borde.
2. **Tierras:** área objetivo por jugador `A = landPercent × W × H / (100 × P)`; radio `r = isqrt(A × 113 / 355)` (π ≈ 355/113 en enteros); `baseSize` = radio del núcleo sólido; el borde se irregulariza con ruido hasta `fuzz %`. Resultado: máscara `playerLand` (plana, sin colinas ni bosque).
3. **Elevación:** `hills` colinas (centro por PRNG fuera de `playerLand`, radio `hillRadius`, altura ≤ `maxHeight` con caída entera) + ruido; `playerLand` fuerza elevación 0 (Ciudadela siempre a 0).
4. **Acantilados:** solo si el script tiene `cliffs` (a ≥ 22 casillas de cualquier inicio). Llanuras de Ceniza: omitida.
5. **Terreno:** `baseTerrain` + parches de clase por ruido (presentación). **Bosques por clumps:** `clumps` grupos de tamaño `size[0..1]`; semilla de cada clump a distancia `≥ avoidPlayers` de todos los inicios (comparación `distSq ≥ avoid²`); crecimiento por frontera con elección por PRNG; no solapan; cada casilla = `tileRes tree`. Lagos/ríos/playas: solo si el script los pide (Llanuras: ninguno).
6. **Conexiones:** flood fill 4-conexo desde el inicio 0 sobre casillas sin `blocked` ni `tileRes`; todo inicio y la casilla de aproximación de cada objeto colocado deben ser alcanzables. Si no, se talan casillas de árbol a lo largo de una línea entera (Bresenham) entre componentes hasta conectar (garantía por construcción) y se registra `corridorsCarved`.
7. **Objetos (distancias de §4.4):** por cada objeto del script, por jugador ascendente: candidatos en el anillo `dist[0] ≤ d ≤ dist[1]` (`distSq` entero) del inicio, sobre casillas libres (sin árbol, `blocked`, reserva de Ciudadela ni otro objeto); elección por PRNG; `group:g` agrupa en un radio `groupSpread`; `tiles:n` (vetas/canteras) crece un polimino conexo de `n` casillas; `total` (Fragmentos) se coloca globalmente a `≥ avoidPlayers` de todos los inicios. Si no hay sitio se relaja la distancia en pasos de 1 hasta `relaxMax`; si sigue sin haber, el intento falla y se regenera (§12.4). Las 3 colonos + 1 batidor iniciales y la Ciudadela salen de `toSimConfig`, no de esta etapa.
8. **Validación de equidad** (§12.4).

#### 12.4 Equidad ±5 % y regeneración

`V(p, c)` = suma de cantidad (µ) de todo lo colocado de la clase `c ∈ {food, wood, aether, stone}` cuyo centro está a `distSq ≤ radiusTiles²` del inicio de `p` (ovejas, ciervos, jabalíes, bayas y granjas = food; casillas de árbol = wood; vetas = aether; canteras = stone; **el jabalí cuenta aunque no se materialice**). El mapa es **justo** si para todo `p, c` con `mean_c > 0`: `|V(p,c) − mean_c| × 100 ≤ tolerancePct × mean_c`. Si falla: `seedUsed = (seed + attempt) >>> 0` y se regenera (determinista, GDD §11.1.8) hasta `maxAttempts` (16). Si ninguno pasa, se devuelve el de **menor desvío máximo** (desempate: menor intento) con `fairness.ok = false` y una advertencia visible en el devlog; nunca se cuelga. `FairnessReport = { ok, attempts, perPlayer: V[], maxDeviationPermille }`.

#### 12.5 Presupuesto y pruebas

`generateMap` ≤ 150 ms en 120×120 / 2 jugadores (medido en Node). Pruebas: misma entrada ⇒ mismo `mapHash` (Node, Node `--jitless`, Chromium); todos los inicios conectados; todo objeto con `approachTile` alcanzable; ningún objeto sobre árbol/bloqueado; estadística sobre 1000 semillas (tasa de éxito en ≤ 16 intentos ≥ 99,9 %; si no, el plan abre una enmienda con una etapa de balanceo de madera); golden `mapHash` para `(seed 1, llanuras_de_ceniza, 2 jugadores, 120)`.

#### 12.6 Materialización (`toSimConfig`)

Convierte `tileRes` en `resRle` (solo `tileKinds.enabled`), `blocked` en `blockedRle`, `starts` en `spawns` (`building` Ciudadela completa + 3 colonos + 1 batidor alrededor, orden fijo por jugador), `animals` en `spawns kind:'animal'` **solo si `resTypes.enabled`** (el jabalí queda fuera en F3), y `players[]` con `startAge = 1`, `stock = [0,0,0,0]` (⇒ `economy.startStock`), `popLimit = game.population.default`. `maxEntities = 4096` (≤ 4 jugadores) o `8192` (> 4). Los Fragmentos no se materializan.

### 13. Snapshot y mensajes del Worker (cliente, `SNAPSHOT_VERSION` 2)

`SNAPSHOT_COLUMNS` (ADR-006 §3.2) se **extiende al final**, en este orden: `hpMax` (I32), `prog` (U16), `kind` (U8), `task` (U8), `bstate` (U8), `carryKind` (U8), `carryAmt` (U8). `prog` = permille: progreso de obra (edificio `FOUNDATION`) o restante/inicial (recurso/granja); `carryAmt` = unidades enteras cargadas (tope 255). El encabezado añade `resVersion` en el índice 10. `flags` no cambia. La interpolación a 60 fps de edificios y recursos es trivial (no se mueven).

Mensajes nuevos en `protocol.ts` (cambios solo por enmienda de este ADR):

```ts
// FromWorker
| { t: 'hud'; tick: number; player: HudPlayer; queues: HudQueue[] }          // cada 5 ticks (4 Hz), solo jugador local
| { t: 'tiles'; version: number; kinds: ArrayBuffer }                        // Uint8Array w*h transferido; al inicio y cuando cambia resVersion (≤ 2 Hz agrupado)
| { t: 'turn'; turn; hash; rejected; skippedUnits; events: number[] }        // events: ternas [kind, player, a, b] aplanadas
export interface HudPlayer { stock: [number, number, number, number]; popUsed: number; popCap: number; age: number;
  techBits: [number, number, number, number]; gatherers: [number, number, number, number]; idleSettlers: number; clockTicks: number }
export interface HudQueue { eid: number; items: { kind: number; id: number }[]; headPermille: number }   // solo edificios propios con cola
```

`worker/client.ts` expone `latestHud()` y `tiles()`. `ToWorker` no cambia. **Estado de pantalla (`GameView`, carril U):** `economy: HudPlayer`, `queues`, `selection.details` (colono: tarea y carga; edificio: PV/progreso/cola; recurso: restante), `placement: {building, tx, ty, valid} | null`, `notifications`. **Intents nuevos (`ui/intents.ts`):** `placeBuilding(id)`, `train(unit, n)`, `research(tech)`, `advanceAge()`, `setRally()`, `cancelQueue(slot)`, `deleteSelection()`, `selectIdleSettler()`, `jumpToCitadel()`. Los strings nuevos van a `packages/data/json/i18n/{es,en}.json` bajo el prefijo `hud.` (excepción de propiedad: el carril U puede **añadir** claves `hud.*`; no edita el resto del JSON).

Eventos de sim (`SimEvent`, **fuera del hash**): `EV_CMD_REJECTED=1, EV_POP_BLOCKED=2, EV_BUILDING_DONE=3, EV_UNIT_TRAINED=4, EV_TECH_DONE=5, EV_AGE_DONE=6, EV_RES_DEPLETED=7, EV_SETTLER_IDLE=8, EV_FARM_EXHAUSTED=9, EV_NO_DEPOT=10, EV_QUEUE_BLOCKED=11`; buffer preasignado (`Int32Array`, tope 256 por turno; el exceso se descarta y se cuenta). `TurnResult` añade `events` (vista).

### 14. Calibración del bot de scouts (GDD §17.2)

**Interpretación (decisión D3).** "Era del Hierro con 21 de población alrededor de 7:55–8:30, ±15 s" se mide en el **instante en que se acepta el comando `advance_age`** (clic de subida), con `popUsed = 21` (3 colonos + 1 Batidor iniciales + 17 colonos entrenados; el bot no entrena más hasta hacer clic). Justificación aritmética: 17 colonos × 25 s = 425 s ⇒ la población 21 no se alcanza antes de **7:05**; la investigación de la era dura 130 s, así que interpretar el intervalo como _llegada_ exigiría hacer clic a ≈ 5:45–6:20 con ≤ 15 colonos, en contradicción con "21 de población". Ventana de aceptación: `[7:55, 8:30]` = ticks `[9500, 10200]`; con la tolerancia de ±15 s del GDD: `[9200, 10500]` (7:40–8:45). Se **informa** además la llegada a Era II (`clic + 2600 ticks`).

**Dos aserciones** en CI (`tools/headless`): (1) `clickTick ∈ [9200, 10500]` y `popAtClick == 21`; (2) `clickTick == PINNED_CLICK_TICK` (valor exacto pineado en el devlog de calibración): cualquier cambio de sim/datos que lo mueva obliga a re-pinear **con nota**.

**Qué se puede calibrar y qué no.** Solo los parámetros marcados AMBIGUO en §3.1 (`start.stock`, `tree.amount`, `farm.maxGatherers`, `tuning.*`, geometría de `mapgen`, y el guion del bot). **Ningún valor transcrito del GDD** (tasas, costos, tiempos, cargas, fórmulas) se toca para entrar en la ventana; si no es posible, se abre una enmienda/ADR (regla "no bajar criterios sin ADR"). El bot es un **cliente puro**: solo emite `Command` por la misma API y lee `World`/`PlayerArrays`; no hay atajos de sim.

### 15. Propiedad de carpetas y carriles paralelos

| Carril                        | Dueño                                                          | Edita                                                                                                                                                            | NO edita                                                       |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **S** contratos compartidos   | `sim-engineer` (A)                                             | `packages/shared/src/{commands,simconfig,simdata,replay,resources,placement,mapscript,events,index}.ts` y sus tests                                              | `data`, `sim` salvo T0                                         |
| **D** datos                   | `content-designer`                                             | `packages/data/**` (JSON, `schemas/`, `src/simdata.ts`, `check.ts`, tests, `COVERAGE.md`)                                                                        | `shared`, `sim`, `client`                                      |
| **E** sim/economía (núcleo)   | `sim-engineer` (A)                                             | `packages/sim/src/{ecs,commands,loop}/**`, `sim/src/economy/{players,production,construction,research,mods,events}.ts`, **una línea** en `steer/` (`w.speed[i]`) | `grid/`, `path/`, resto de `steer/`                            |
| **G** sim/recolección         | `sim-engineer` (3º)                                            | `sim/src/economy/{tasks,gather,tiles,search,animals,farm}.ts`                                                                                                    | `ecs/` (las columnas las declara E/T0 de una vez), `commands/` |
| **M** mapgen                  | `sim-engineer` (2º) + `content-designer` (script, estadística) | `packages/sim/src/mapgen/**`; `data/json/maps/*` (content)                                                                                                       | `economy/`, `ecs/`                                             |
| **W** integración cliente↔sim | `sim-engineer` (A) tras E1                                     | `packages/client/src/worker/**`, `boot/game.ts`, `test/worker/**`                                                                                                | `render/`, `input/`, `ui/`                                     |
| **R** render                  | `render-engineer`                                              | `client/src/render/**`, `client/test/render/**`                                                                                                                  | `worker/`, `input/`, `ui/`                                     |
| **U** HUD y entrada           | `ui-engineer`                                                  | `client/src/{input,ui}/**`, tests espejo, claves `hud.*` de i18n                                                                                                 | `render/`, `worker/`                                           |
| **A** arte provisional        | `art-pipeline`                                                 | `tools/asset-pipeline/**`, `client/src/assets/manifest.ts`, `ASSETS_LICENSES.md`                                                                                 | `render/`                                                      |
| **Q** QA                      | `qa-engineer`                                                  | `tools/headless/**` (bot, escenarios, goldens), `e2e/**`, scripts de perf                                                                                        | código de producto                                             |

**Puntos de integración** (cada uno con su stub de T0, de modo que `main` compila siempre):

| IP  | Qué se acopla                                                                                                                                                    | Antes de IP el carril trabaja contra   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| IP0 | T0: tipos, columnas declaradas (sin lógica), `commandShapeError` v3, `placementError`, layout de snapshot v2, tipos de mensajes, `GeneratedMap`, `FakeHudSource` | —                                      |
| IP1 | D2: `buildSimData` v2 real                                                                                                                                       | `SimData` de fixture (T0)              |
| IP2 | E1–E2: columnas, hash v3, comandos, `createSim` v2                                                                                                               | stubs de T0                            |
| IP3 | M5: `generateMap`/`toSimConfig`                                                                                                                                  | mapa de fixture a mano                 |
| IP4 | W: snapshot v2 + mensajes `hud`/`tiles` + `boot` con mapgen                                                                                                      | `FakeHudSource` y snapshots sintéticos |
| IP5 | Q2: bot sobre sim real (E+G+M) y bucle de calibración                                                                                                            | —                                      |

### 16. Verificación (por carril; el mapeo criterio → evidencia vive en el plan)

- **Datos:** `data:check` (cruces de §3.3), tests de `buildSimData` v2 (valores derivados exactos, p. ej. `0,43/s → 21 500 µ/tick`; `hash` estable; test de navegador igual que `simdata` de F2).
- **Sim:** pruebas unitarias por sistema (fórmula 3t/(n+2): 1 colono = `buildTicks`, 2 = 75 %, 4 = 50 %; reparación 750/375 PV/min; granja con búfer; podredumbre; capacidad con Carretilla; tasas con Hacha), invariantes (stock ≥ 0, `popUsed ≤ popCap` salvo reserva, `rebuildOccupancy` idéntica, conservación de recursos), determinismo (`test:det`: golden nuevo + equivalencia legacy del `thousand`, caché-transparencia), presupuesto (tick ≤ 3 ms con 150 colonos recolectando + 400 unidades; hash por turno ≤ 0,5 ms con 2 000 entidades).
- **Cliente:** pruebas de `placementError` paridad sim/cliente, de `GameView`/intents, e2e (`pnpm e2e:render` ampliado) y proxy de rendimiento.

## Decisiones de interpretación (registro)

| #   | Decisión                                                                      | Alternativa descartada                                            |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| D1  | 9 construibles en F3 (no 12 del ejemplo de devlog)                            | Habilitar Arquería/Forja/Mercado sin función                      |
| D2  | "2 edificios" de requisito de era = 2 **tipos** distintos                     | Contar instancias                                                 |
| D3  | Calibración mide el **clic** de era                                           | Medir la llegada (aritméticamente imposible con 21 pob., ver §14) |
| D4  | Árboles/bayas/vetas/canteras = capa por casilla, no entidades                 | Una entidad por árbol (agota las 65 535 ranuras)                  |
| D5  | Granjas caminables (`placeOcc` separado de `grid.occ`)                        | Granja bloqueante (encierra granjeros)                            |
| D6  | `farm_amount` solo afecta granjas nuevas/resembradas                          | Retroactivo (ADR si se quiere)                                    |
| D7  | Ciervo estático y pasivo + golpe de caza provisional; jabalí no materializado | Combate mínimo en F3 (adelanta F4 y deja dos sistemas de daño)    |
| D8  | Captura de ovejas por `losTiles` en la sim                                    | Leer el `VisionGrid` del cliente (no determinista)                |
| D9  | Recursos en µ (1e-6) y tasas por tick sin sesgo                               | `Fx` de 1/1000 (error de 2,3 % en 0,43/s)                         |
| D10 | Hash v3 re-pineado con test de equivalencia legacy                            | Re-pinear sin demostrar que el movimiento no cambió               |

## Alternativas consideradas

- **Recolección por golpes discretos para todo:** más fiel a AoE2, pero cambia la granularidad sin cambiar la tasa efectiva; se usa solo en la granja (donde el GDD lo especifica).
- **Cola de búsquedas oculta:** estado no hasheado ⇒ riesgo de desync; se usa escaneo por ranura con presupuesto (estado = `task/aux`, hasheado).
- **Generador dentro del Worker de la sim:** mezcla responsabilidad con el estado de partida; el mapa explícito en `SimConfig` da repeticiones independientes de la versión del generador.
- **Mover la niebla a la sim ya:** no hay consumidor en F3 (ADR-006 §7.1); se mantiene la deuda a F4.
- **Una sola tabla de `typeId` global:** obligaba a renumerar `unitIds` (cambia hashes sin necesidad); `kind` mantiene intactos los índices de `units.json`.

## Consecuencias

- Cambian a la vez `REPLAY_FORMAT_VERSION` (3), `SIM_DATA_HASH_LAYOUT` (2), `DATA_VERSION` (0.3.0), `SNAPSHOT_VERSION` (2) y el golden; las repeticiones de F1–F2 dejan de ser válidas (no se conservan, ADR-005).
- El coste del hash por turno crece (~36 columnas); se vigila con el presupuesto de §16.
- `steer/` lee `w.speed[i]` (una línea): requiere revisión del dueño de la ola 2 y el test de movimiento existente debe seguir verde con hash legacy idéntico.
- `contracts.md` se actualiza al cerrar T0: `sim` pasa a consumir `shared/resources|placement|mapscript`; `data` exporta `buildMapScript`; `client` consume `placementError`.
- Obligaciones para fases siguientes: F4 migra la visión a la sim, reemplaza el golpe de caza, añade guarnición/campana y materializa el jabalí; F5 la atracción de jabalí; F7 Eras III–IV, mercado, naval y Fragmentos.

## Riesgos abiertos

1. **Ventana de Era II:** si el bot no entra en `[9200, 10500]` solo con parámetros AMBIGUO, hace falta ADR (no se baja el criterio).
2. **Valores no dados por el GDD** (stock inicial, madera por árbol, PV del ciervo, `farm.maxGatherers`): sesgan la calibración; quedan marcados y reversibles.
3. **Comportamiento del steering con 150 colonos junto a casillas bloqueadas** (bosques, bayas, veta) y desalojo bajo cimientos: F1 no lo probó; hay tests dedicados (G5, E3).
4. **Equidad ±5 % con bosques aleatorios:** la tasa de éxito se mide (M6); fallback documentado.
5. **Determinismo cruzado:** Firefox/WebKit solo en CI (STATUS 2/4); los goldens nuevos heredan esa limitación.
6. **Alcance:** ~40 tareas en 6 carriles; el riesgo está en E↔G (columnas) y en W↔U/R (mensajes): por eso T0 declara **todas** las columnas y mensajes de una vez.

## Enmiendas

(vacío; se añaden aquí al implementar, como en ADR-005/006)
