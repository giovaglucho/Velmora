# ADR-006: Cliente — Worker de simulación, render PixiJS, niebla, UI y pruebas sin GPU (Fase 2)

Estado: **Propuesto** (pasa a Aceptado tras la revisión R1 de Fase 2 por `architect`/`reviewer`). Fecha: 2026-11-21. Contexto: PLAN Fase 2, GDD §11.3, §13.2–13.3, §15.2, §15.4, §17.1; ADR-004 (COOP/COEP), ADR-005 (ECS, comandos, loop; **aceptado**), `docs/contracts.md`.

## Contexto

La Fase 2 reparte el cliente entre varios agentes que trabajan en paralelo (plan en `docs/progress/fase-02/plan.md`):

- **W** (`sim-engineer`): Web Worker de simulación, snapshots, puente de comandos.
- **R** (`render-engineer` ×2): PixiJS, proyección, terreno, unidades, cámara, niebla, minimapa.
- **U** (`ui-engineer`): entrada, selección, órdenes, grupos, React mínimo, store.
- **A** (`art-pipeline`): terreno y sprites provisionales procedurales.
- **Q** (`qa-engineer`): arnés Playwright con WebGL por software, medición, capturas.

Este ADR fija las **interfaces exactas** entre carriles. Cualquier desviación requiere enmendar este ADR antes de mergear. Convenciones: "Fx" = punto fijo de ADR-005 (1/1000 de casilla); "tile" = casilla; el código del cliente **puede** usar floats (no está bajo `lint:sim`), pero todo lo que sale hacia la sim (comandos) es entero.

## Decisión

### 1. Resumen

| Tema            | Decisión                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sim             | Corre en un **Web Worker** módulo (`sim.worker.ts`); el hilo principal nunca importa el runtime de `@reinos/sim` (solo tipos).                                                         |
| Cadencia        | Sim a **20 Hz** (50 ms/tick a velocidad 1,0; `tickIntervalMs = 50 / speed`); render a **rAF** (60+ fps). El render interpola `prev → pos` de cada entidad.                             |
| Transporte      | Snapshots de **typed arrays con layout fijo**. `SharedArrayBuffer` (triple buffer con `Atomics`) solo si `crossOriginIsolated`; si no, `ArrayBuffer` **transferible** con reciclado.   |
| Render          | **PixiJS v8, renderer WebGL** forzado (`preference: 'webgl'`; WebGPU fuera de alcance). Proyección 2:1, casilla 128×64, zooms 0,6/1/1,4.                                               |
| Terreno         | Una malla (quad) por chunk de 16×16; **shader de splatting en espacio de rejilla** con 4 capas, textura de pesos por vértice de casilla y máscara de ruido. Sin texturas por chunk.    |
| Niebla          | **En el cliente en F2** (módulo puro, solo enteros, portable a la sim). Ver §7 para la justificación.                                                                                  |
| UI              | React 19 sobre el canvas; store Zustand de **solo lectura** a 10 Hz. Entrada (puntero/teclado) imperativa, fuera de React.                                                             |
| Assets          | **Solo generados proceduralmente por nosotros** (Node, semilla fija). Sin descargas. Registrados en `ASSETS_LICENSES.md` como "Propio".                                                |
| Pruebas sin GPU | Playwright Chromium headless con SwiftShader; unit tests en Node de proyección/picking/culling/niebla/codec. FPS en software = **proxy**, no equivale al hardware de referencia (§10). |

### 2. Estructura de carpetas de `packages/client/src`

```
packages/client/src/
  main.ts                 # arranque: crea SimClient, Renderer, InputController, monta React (I1)
  index.ts                # exports públicos del paquete (tipos de contratos)
  boot/
    isolation.ts          # detecta crossOriginIsolated, elige modo de snapshot, lee query params (?snap=, ?perf=)
    debug.ts              # window.__reinos (API de pruebas, solo si import.meta.env.DEV o ?debug=1)
  worker/                 # DUEÑO: sim-engineer. Único código del cliente que importa @reinos/sim en runtime.
    protocol.ts           # tipos de mensajes (§3.1). Contrato.
    snapshot.ts           # layout + SnapshotWriter + SnapshotReader (§3.2–3.4). Contrato.
    host.ts               # SimHost: pacing, scheduler de comandos, estadísticas; sin `self` (testeable en Node)
    sim.worker.ts         # entrada del Worker (≤ 30 líneas): conecta self.postMessage con SimHost
    client.ts             # SimClient (hilo principal): start/send/latest/dispose (§3.5)
    scenarios.ts          # SimConfig de demo (mapa 128×128, 100/400 unidades) generados desde semilla
  render/                 # DUEÑO: render-engineer. Sin acceso a React ni a @reinos/sim.
    constants.ts          # TILE_W=128, TILE_H=64, ZOOMS=[0.6,1,1.4], CHUNK_TILES=16 (estructurales, GDD §15.4)
    iso.ts                # proyección y su inversa (puro) (§4.1)
    camera.ts             # estado de cámara, zoom por niveles, límites, viewport→rect de mundo (puro)
    culling.ts            # rango visible de tiles/chunks, AABB de sprites (puro)
    depth.ts              # clave de profundidad (puro)
    renderer.ts           # Renderer: Application Pixi, capas, bucle rAF, interpolación
    terrain/
      terrainMap.ts       # TerrainMap (tipos por tile, pesos por vértice) generado desde MapSpec + semilla
      chunks.ts           # malla por chunk, visibilidad por culling
      splat.frag.glsl.ts  # shader de splatting (GLSL ES 3.00) como string TS
    entities/
      unitLayer.ts        # pool de sprites por ranura, interpolación, orden de profundidad, culling
      markers.ts          # marcador de orden y anillos de selección
    fog/
      visionGrid.ts       # rejilla de visibilidad con conteo de referencias (puro, SIN Pixi/DOM)
      fogRenderer.ts      # textura R8 + malla overlay + shader de desenfoque
    minimap/
      minimap.ts          # Canvas2D, 10 Hz (§7.4)
  input/                  # DUEÑO: ui-engineer. Sin Pixi (solo usa render/{iso,camera,culling} puros).
    pointerRouter.ts      # eventos de puntero/teclado del canvas → intenciones
    cameraController.ts   # flechas, borde, botón central, rueda
    picking.ts            # pickPoint / pickBox contra SnapshotView (puro)
    selection.ts          # SelectionModel (tope por datos), Shift/Ctrl/doble clic
    controlGroups.ts      # Ctrl+0–9, doble pulsación centra
    orders.ts             # clic derecho → Command[] (formato shared) + disparo de marcador
  ui/                     # DUEÑO: ui-engineer. React 19.
    store.ts              # store Zustand de solo lectura (§8.1)
    bridge.ts             # publica a 10 Hz desde SimClient/SelectionModel/Renderer.stats al store
    App.tsx               # capa DOM: HUD mínimo
    hud/SelectionPanel.tsx, hud/DevOverlay.tsx, hud/MinimapHost.tsx
    i18n.ts               # textos es (código en inglés, UI en español)
  assets/                 # DUEÑO: art-pipeline (generador) + render-engineer (carga)
    manifest.ts           # tipos del manifest.json generado + validación Zod
    loader.ts             # carga atlas/texturas con PIXI.Assets
packages/client/public/assets/provisional/   # SALIDA generada (no editar a mano; ver §9)
packages/client/test/     # tests Vitest (entorno node) por carpeta espejo
tools/asset-pipeline/src/provisional/        # generadores (Node, sin red)
e2e/render/                                  # Playwright con SwiftShader (§10)
```

Reglas de importación (se aplican con `no-restricted-imports` de ESLint por carpeta y un test de dependencias):

| Carpeta                                                                                | Puede importar                                                                                                   | Prohibido                                                            |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `worker/`                                                                              | `@reinos/sim`, `@reinos/shared`, `@reinos/data`                                                                  | `pixi.js`, `react`, DOM                                              |
| `render/`                                                                              | `pixi.js`, `@reinos/shared`, `@reinos/data` (solo tipos/lectura), `worker/snapshot` (**solo** el lector y tipos) | `@reinos/sim` (runtime), `react`, `input/`, `ui/`                    |
| `render/**/*.ts` marcados "puro" (iso, camera, culling, depth, visionGrid, terrainMap) | `@reinos/shared`                                                                                                 | `pixi.js`, DOM, `Date`, `performance` (reciben tiempo por parámetro) |
| `input/`                                                                               | `render/{iso,camera,culling,depth}`, `worker/{snapshot,client}`, `@reinos/shared`                                | `pixi.js` (excepto tipos), `react`                                   |
| `ui/`                                                                                  | `react`, `zustand`, `ui/store`, tipos                                                                            | `render/` runtime, `worker/` runtime (solo el `bridge`)              |

`@reinos/client` ya puede depender de `sim`, `shared`, `data` (`docs/contracts.md`); hay que **declarar** `@reinos/sim`, `@reinos/shared` y `@reinos/data` en `packages/client/package.json` (hoy no lo están).

### 2.1 Dependencias a agregar

Todas con versión exacta registrada por el lockfile; verificar con `pnpm view <pkg> version peerDependencies` antes de fijar el rango (no se asume la última). Versiones mínimas:

| Paquete                                         | Dónde                                | Rango objetivo                                  | Uso                                                                          |
| ----------------------------------------------- | ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `pixi.js`                                       | client (dependency)                  | `^8`                                            | Render (WebGL)                                                               |
| `react`, `react-dom`                            | client (dependency)                  | `^19`                                           | HUD                                                                          |
| `zustand`                                       | client (dependency)                  | `^5`                                            | Store de solo lectura (`createStore` vanilla + `useStore`)                   |
| `@vitejs/plugin-react`                          | client (dev)                         | rama compatible con **Vite 8** (verificar peer) | JSX/Fast Refresh                                                             |
| `@types/react`, `@types/react-dom`              | client (dev)                         | `^19`                                           | Tipos                                                                        |
| `@reinos/sim`, `@reinos/shared`, `@reinos/data` | client (`workspace:*`)               | —                                               | Contratos y Worker                                                           |
| `pngjs`                                         | `tools/asset-pipeline` y `e2e` (dev) | `^7`                                            | Escribir PNG de assets procedurales y leer capturas en las métricas de píxel |
| `gifenc`                                        | `tools/devlog` o `e2e` (dev)         | `^1`                                            | GIF del devlog (alternativa: `ffmpeg` si existe; no se asume)                |

Cambios de configuración que acompañan (tarea T0): `tsconfig.json` del cliente con `"jsx": "react-jsx"` y `"types": ["node", "vite/client"]`; `vite.config.ts` con `plugins: [react()]`, `worker: { format: 'es' }`, **cabeceras COOP `same-origin` + COEP `require-corp`** en `server.headers` y `preview.headers` (idénticas a las del Blueprint, ADR-004) y `assetsInlineLimit: 0`. Con COEP `require-corp` todo subrecurso debe ser del mismo origen: por eso los assets son locales (§9) y no hay fuentes/CDN externos en el cliente.

---

## 3. Contrato del Web Worker de simulación (carril W)

### 3.1 Mensajes (`worker/protocol.ts`, tipos exactos)

```ts
import type { Command } from '@reinos/shared';
import type { SimConfig } from '@reinos/shared';

export type SnapshotMode = 'sab' | 'transfer';

// --- hilo principal → worker ---
export type ToWorker =
  | {
      t: 'init';
      seed: number; // uint32
      config: SimConfig;
      speed: number; // multiplicador de velocidad de juego; default 1 (F2); game.json standardGameSpeed = 1.7 llega en el menú (F5)
      mode: SnapshotMode;
      /** Solo mode === 'sab': buffer creado por el hilo principal con sharedSnapshotBytes(capacity). */
      sab?: SharedArrayBuffer;
    }
  | { t: 'cmd'; cmds: Command[] } // la sim ignora `turn` de entrada: SimHost lo reescribe (§3.6)
  | { t: 'ctl'; op: 'pause' | 'resume' | 'speed' | 'step'; value?: number } // 'step' = avanzar 1 turno estando en pausa (tests)
  | { t: 'recycle'; buffer: ArrayBuffer } // solo mode 'transfer': devuelve un buffer ya leído
  | { t: 'probe'; id: number } // el worker responde 'probe' con hashFull() (tests/depuración)
  | { t: 'stop' };

// --- worker → hilo principal ---
export type FromWorker =
  | {
      t: 'ready';
      capacity: number; // world.capacity (define el layout)
      dataVersion: string;
      simDataHash: number | null; // H3 (R1 de F1); null hasta que exista
      mode: SnapshotMode; // modo efectivamente usado
    }
  | { t: 'snap'; tick: number; buffer: ArrayBuffer } // mode 'transfer' (buffer transferido)
  | { t: 'snapSab' } // mode 'sab': aviso opcional; el lector usa los Atomics, no depende de este mensaje
  | { t: 'turn'; turn: number; hash: number; rejected: number } // uno por turno (cada 4 ticks)
  | {
      t: 'perf';
      tickMsAvg: number;
      tickMsP95: number;
      tickMsMax: number;
      ticksBehind: number;
      ticksDropped: number;
    } // cada 1000 ms
  | { t: 'probe'; id: number; hashFull: number }
  | { t: 'error'; message: string };
```

Reglas:

1. El worker construye `SimData` con `buildSimData(loadGameData())` (mismo bundle que el cliente) y comprueba `dataVersion`; el cliente también carga `GameData` (para `los`, radios, `sprite`). Ambos lados deben coincidir en `dataVersion` (y en `simDataHash` cuando exista); si no, `error` y no arranca.
2. El mensaje `init` es el primero y único; un segundo `init` lanza error. `ready` es la señal para empezar a leer snapshots.
3. Mensajes mal formados (forma de `Command` inválida según `validateCommandShape`) se descartan y se cuentan (`rejected` de `perf` futuro); **nunca** lanzan dentro del loop de la sim.
4. Ningún mensaje transporta objetos con prototipo propio ni funciones; todo es estructurado-clonable (JSON-compatible salvo `ArrayBuffer`/`SharedArrayBuffer`).

### 3.2 Snapshot: contenido

Una instantánea del estado **renderizable** al final de un tick. Indexada **por ranura** (`idx` del eid, ADR-005 §3): los tamaños de columna son `capacity`; solo se escribe `[0, highWater)`. Así el render asigna sprite = ranura sin tablas de búsqueda ni reordenaciones.

Cabecera (`Int32[16]`, offset 0, 64 bytes):

| Índice | Campo            | Valor                                                                            |
| ------ | ---------------- | -------------------------------------------------------------------------------- |
| 0      | `magic`          | `0x534e4150` ("SNAP")                                                            |
| 1      | `version`        | `1` (subir si cambia el layout)                                                  |
| 2      | `capacity`       | capacidad del mundo                                                              |
| 3      | `tick`           | ticks completados (`sim.tick`)                                                   |
| 4      | `turn`           | `sim.turn`                                                                       |
| 5      | `highWater`      | columnas válidas en `[0, highWater)`                                             |
| 6      | `count`          | entidades vivas                                                                  |
| 7      | `tickIntervalUs` | intervalo real entre ticks en microsegundos al publicar (`round(50000 / speed)`) |
| 8      | `mapW`           | ancho del mapa en tiles                                                          |
| 9      | `mapH`           | alto del mapa en tiles                                                           |
| 10–15  | reservado        | 0                                                                                |

Columnas (tras la cabecera, cada una alineada a 4 bytes, en este orden **exacto**; longitud `capacity`):

| Orden | Columna  | Tipo     | Origen en `World` (ADR-005 §3)                                         |
| ----- | -------- | -------- | ---------------------------------------------------------------------- |
| 1     | `posX`   | `Int32`  | `posX` (Fx, fin del tick)                                              |
| 2     | `posY`   | `Int32`  | `posY`                                                                 |
| 3     | `prevX`  | `Int32`  | `prevX` (Fx, inicio del tick: origen de la interpolación)              |
| 4     | `prevY`  | `Int32`  | `prevY`                                                                |
| 5     | `hp`     | `Int32`  | `hp` (Fx)                                                              |
| 6     | `gen`    | `Uint16` | `gen` (con la ranura reconstruye `eid = (gen << 16) \| idx`)           |
| 7     | `typeId` | `Uint16` | `typeId`                                                               |
| 8     | `facing` | `Uint16` | `facing` (0..1023)                                                     |
| 9     | `owner`  | `Uint8`  | `owner` (255 = neutral)                                                |
| 10    | `flags`  | `Uint8`  | bit0 `alive`; bit1 `moving` (`velX \| velY` ≠ 0); bits 2–3 `orderKind` |

`snapshotLayout(capacity)` (pura, en `worker/snapshot.ts`) devuelve `{ totalBytes, offsets }`; **ambos lados la llaman con el mismo `capacity`** y construyen las vistas con `new Int32Array(buf, offset, capacity)` etc. Tamaño: `64 + capacity × (5×4 + 3×2 + 2×1)` ≈ `64 + 28·capacity` bytes (con relleno de alineación). Con `capacity = 4096` → ~115 KB; transferirlo a 20 Hz es ~2,3 MB/s, despreciable.

El worker copia con `TypedArray.prototype.set(world.col.subarray(0, highWater))` (sin bucles por entidad salvo `flags`, que se compone en un bucle sobre `[0, highWater)`). Cero asignaciones en régimen estacionario.

### 3.3 Transporte en modo `transfer` (por defecto, siempre disponible)

- Pool de 3 `ArrayBuffer` de `totalBytes`, creado por el worker. Tras escribir, `postMessage({t:'snap', tick, buffer}, [buffer])` (el buffer queda **neutered** en el worker).
- El hilo principal conserva como **actual** el último recibido; al llegar uno nuevo, el actual anterior vuelve con `postMessage({t:'recycle', buffer}, [buffer])`. Si el worker no tiene buffer libre en el pool, **omite** la publicación de ese tick (el render usa el último; es back-pressure sin bloquear la sim). Si el pool se agota se asigna uno nuevo (contador `perf` lo reporta; objetivo estacionario 0 asignaciones).
- Si llegan varios `snap` antes del siguiente rAF, el cliente usa el más reciente y recicla los demás.

### 3.4 Transporte en modo `sab` (solo si `crossOriginIsolated === true` **y** `typeof SharedArrayBuffer !== 'undefined'`)

Disposición del `SharedArrayBuffer` (`sharedSnapshotBytes(capacity) = 64 + 3 × totalBytes`):

- `Int32[16]` de control (offset 0): `[0]=latest` (ranura publicada, -1 = ninguna), `[1]=reading` (ranura en lectura, -1 = ninguna), `[2]=pubCount` (contador de publicaciones, monótono).
- 3 ranuras de snapshot consecutivas (mismo layout que §3.2, cada una con su cabecera).

Protocolo (triple buffer sin bloqueos, `Atomics.*` seq-cst):

```
escritor (worker), tras cada tick o lote de ticks:
  l = Atomics.load(ctrl,0); r = Atomics.load(ctrl,1)
  w = primer s en {0,1,2} con s !== l && s !== r        // siempre existe (3 ranuras, 2 excluidas)
  escribir snapshot en ranura w
  Atomics.store(ctrl,0,w); Atomics.add(ctrl,2,1)
lector (hilo principal), una vez por rAF:
  do { s = Atomics.load(ctrl,0); if (s<0) return null; Atomics.store(ctrl,1,s) } while (Atomics.load(ctrl,0) !== s)
  usar la ranura s hasta el siguiente rAF (la vista es válida hasta la siguiente llamada a latest())
  (el reintento cierra la carrera "el escritor elige s justo antes de que se marque reading")
```

La detección de snapshot nuevo es `ctrl[2] !== lastPubCount` (no depende de mensajes). Si `crossOriginIsolated` es `false` (cabeceras ausentes, navegador sin soporte, `file://`), el cliente usa `transfer` **sin cambiar ningún otro código**: ambos modos implementan la misma interfaz `SnapshotSource` (§3.5). Los tests de CI cubren los dos modos (`?snap=sab` y `?snap=transfer`).

### 3.5 Interfaz del hilo principal (`worker/client.ts`)

```ts
export interface SnapshotView {
  readonly tick: number;
  readonly turn: number;
  readonly highWater: number;
  readonly count: number;
  readonly tickIntervalUs: number;
  readonly mapW: number;
  readonly mapH: number;
  readonly posX: Int32Array;
  readonly posY: Int32Array;
  readonly prevX: Int32Array;
  readonly prevY: Int32Array;
  readonly hp: Int32Array;
  readonly gen: Uint16Array;
  readonly typeId: Uint16Array;
  readonly facing: Uint16Array;
  readonly owner: Uint8Array;
  readonly flags: Uint8Array;
  eid(slot: number): number; // (gen << 16) | slot
}
export interface SimClient {
  start(init: {
    seed: number;
    config: SimConfig;
    speed?: number;
    mode?: SnapshotMode;
  }): Promise<ReadyInfo>;
  /** Último snapshot; null si no hay. La vista es válida solo hasta la siguiente llamada a latest(). */
  latest(): SnapshotView | null;
  /** Marca de tiempo (performance.now) en que `latest()` observó por primera vez su tick: base de la interpolación. */
  readonly latestArrivalMs: number;
  send(cmds: Command[]): void;
  control(op: 'pause' | 'resume' | 'speed' | 'step', value?: number): void;
  onTurn(cb: (t: { turn: number; hash: number; rejected: number }) => void): () => void;
  readonly perf: Readonly<PerfInfo>; // último mensaje 'perf'
  dispose(): void;
}
```

`SimHost` (testeable en Node con reloj falso) recibe `post(msg, transfer?)` inyectado y un `now(): number` inyectado; `sim.worker.ts` solo los conecta con `self`.

### 3.6 Pacing y planificación de comandos (`worker/host.ts`)

- Bucle del worker: `setInterval(pump, 4)` con acumulador por `performance.now()`. En cada `pump`: `acc += dt`; mientras `acc >= tickIntervalMs` y `ticksEnLote < 4`: `stepTick(...)`; `acc -= tickIntervalMs`. Si tras el lote `acc > 10 × tickIntervalMs` se descarta el exceso (`acc = 0`, `ticksDropped++`; válido en un solo jugador; en lockstep (F9) el ritmo lo marca el relay, no el reloj local). Se publica **un** snapshot por `pump` que haya avanzado (el último tick del lote).
- Cadencia: `tickIntervalMs = 50 / speed` (F2: `speed = 1`, 20 Hz; fijo en tests). La velocidad estándar del GDD (1,7) se activa con `ctl speed` en F5.
- Turno: `step` de la sim equivale a 4 `stepTick`. El host usa `stepTick` (publica a 20 Hz, no a 5 Hz) y entrega `commands` **solo** cuando `sim.tick % TURN_TICKS === 0`. Tras completar el tick que cierra un turno emite `{t:'turn', turn, hash: sim.hash(), rejected}`.
- Planificador de comandos (`CommandScheduler`): los `cmd` recibidos se acumulan; en la siguiente frontera de turno se emiten **todos** con `turn = sim.turn` (reescritura obligatoria: el cliente envía `turn: 0`). La política n+2 de lockstep (ADR-002) la sustituirá en F9 detrás de la misma interfaz `scheduleTurn(currentTurn): number`; en F2 es `currentTurn` (próxima frontera). Latencia de orden → primer movimiento ≤ 1 turno (200 ms) + 1 tick = **≤ 5 ticks**; el feedback visual (marcador, anillo) es inmediato en el cliente y no espera a la sim.
- El orden de los comandos dentro del turno lo fija la sim (ADR-005 §5: estable por `playerId`); el scheduler conserva el orden de llegada.

### 3.7 Interpolación a 60 fps (contrato de render)

Para cada ranura viva con snapshot `S` (tick `t`):

```
alpha = clamp((now - latestArrivalMs) / (S.tickIntervalUs / 1000), 0, 1)
renderX = prevX + (posX - prevX) * alpha        // en Fx, luego a tiles (/1000) y a píxeles (iso.ts)
renderY = prevY + (posY - prevY) * alpha
```

- `prev` es la posición al inicio del tick `t` y `pos` la del final: el render muestra siempre el tramo del último tick completado, con retraso medio de ½ tick (25 ms). Si el siguiente tick se retrasa, `alpha` se **satura en 1** (la unidad se detiene en `pos`; no hay extrapolación).
- Discontinuidades: si `|pos - prev|` > `MAX_INTERP_JUMP_FX = 4000` (4 tiles, constante estructural en `render/constants.ts`) en cualquier eje, no se interpola (teletransporte/spawn). Una ranura que pasa de muerta a viva (flags bit0) también salta.
- `facing` no se interpola (la sim ya lo suaviza en C); animación: `frame = ((tick >> 1) + slot) & 3` si `moving`, si no `idle`.

### 3.8 Hash y desync

El worker emite `hash` por turno (de `sim.hash()`); el cliente lo expone en `__reinos.lastTurnHash` y el test e2e lo compara con el de Node para el mismo escenario y semilla (prueba de que el Worker en el navegador reproduce la sim; complementa `test:det:browsers`).

---

## 4. Contrato de render (carril R)

### 4.1 Proyección (`render/iso.ts`, puro)

Constantes (`render/constants.ts`, estructurales, GDD §15.4): `TILE_W = 128`, `TILE_H = 64`, `HALF_W = 64`, `HALF_H = 32`, `ZOOMS = [0.6, 1, 1.4]`, `CHUNK_TILES = 16`, `ELEV_PX = 16` (px por nivel de elevación en zoom 1; F2 todo a elevación 0, la API ya lo acepta).

Coordenadas de rejilla `(gx, gy)` en tiles (float; `gx = Fx / 1000`). Píxeles de **mundo** (zoom 1, sin cámara):

```
wx = (gx - gy) * HALF_W
wy = (gx + gy) * HALF_H - h * ELEV_PX          // h = elevación en niveles (0 en F2)
inversa (h = 0):  gx = (wx / HALF_W + wy / HALF_H) / 2 ;  gy = (wy / HALF_H - wx / HALF_W) / 2
```

- Orientación: la esquina superior del rombo del mapa es `(gx,gy) = (0,0)` → `wx = 0, wy = 0`; +x de la sim apunta **abajo-derecha**, +y **abajo-izquierda**. El mapa `W×H` ocupa `wx ∈ [-H·64, W·64]`, `wy ∈ [0, (W+H)·32]`. El centro del tile `(i,j)` es `(i+0.5, j+0.5)`.
- Pantalla: `sx = (wx - cam.x) * zoom + vw/2`, `sy = (wy - cam.y) * zoom + vh/2`. `vw, vh` en px CSS; Pixi renderiza con `resolution = min(devicePixelRatio, 2)`.
- Funciones: `gridToWorld(gx, gy, h?)`, `worldToGrid(wx, wy)`, `worldToScreen(cam, vp, wx, wy)`, `screenToWorld(...)`, `screenToGrid(...)`, `fxToGrid(fx) = fx / 1000`, `gridToFx(g) = Math.round(g * 1000)` (único redondeo hacia la sim; el comando resultante es entero y se acota a `[0, W·1000-1]`).

### 4.2 Cámara (`render/camera.ts`, puro)

Estado: `{ x, y /* centro en px de mundo */, zoomIndex: 0|1|2, zoomT /* zoom animado */ }`. Zoom efectivo `ZOOMS[zoomIndex]` con interpolación exponencial (τ ≈ 80 ms) hacia el objetivo; el zoom se ancla al puntero (el punto de mundo bajo el cursor no se mueve). Límites: el centro se acota al rombo del mapa expandido 4 tiles. Velocidades de desplazamiento (px de pantalla/s), banda de borde (20 px) y retardo de borde (150 ms) son **preferencias de UI**: viven en `packages/data/json/game.json` bloque `camera` (regla "valores solo en data") y las lee `cameraController`. `camera.ts` expone `viewRectWorld(cam, vp)` (rectángulo visible en px de mundo) y `centerOnFx(cam, fxX, fxY)`.

### 4.3 Culling (`render/culling.ts`, puro)

- `visibleTileRange(cam, vp, mapW, mapH, marginTiles)`: proyecta las 4 esquinas del viewport con `screenToGrid`, toma el AABB en rejilla, lo expande por `marginTiles` y lo recorta al mapa → `{x0,y0,x1,y1}`. Es **conservador** (superconjunto del visible exacto; nunca omite un tile visible) — el test lo verifica contra fuerza bruta.
- `visibleChunks(range)`: chunks `cx ∈ [x0>>4, x1>>4]`, `cy` análogo. El chunk invisible se pone `visible = false` (no se dibuja ni se actualiza).
- Unidades: un sprite se omite si su AABB de pantalla (`ancho 64, alto 96` px × zoom, anclado al pie) más 16 px de margen no intersecta el viewport. Se calcula **antes** de tocar el sprite de Pixi.
- El culling usa la posición **interpolada** de ese frame.

### 4.4 Orden de profundidad (`render/depth.ts`, puro)

`depthKey = ((fxX + fxY) >> 7) * 4096 + (slot & 4095)` con `fxX/fxY` la posición interpolada redondeada a entero (`>> 7` = cubos de 1/8 de tile en `x+y`; empate por ranura ascendente → orden estable). Para edificios (F3) la clave usa la esquina inferior de la huella. Los sprites de la capa de entidades se ordenan con `zIndex = depthKey` (contenedor con `sortableChildren = true`; se reasigna solo si cambió el cubo). Elevación: `depthKey` suma `h * 8 * 4096` cuando exista elevación.

### 4.5 Capas del `Renderer` (de abajo arriba)

1. `terrain` (mallas de chunk).
2. `decals` (anillos de selección, marcador de orden, sombras baked en sprite → no hay capa de sombras en F2).
3. `entities` (sprites de cuerpo + máscara de equipo, ordenados por profundidad).
4. `fog` (malla overlay, §7.3).
5. (sin capa de HUD en Pixi: el HUD es DOM.)

`Renderer` API: `new Renderer({ canvas, simClient, data, terrain })`, `start()`, `resize(w,h)`, `camera` (lectura/escritura), `stats` (`{ fps, frameMs, updateMs, drawCalls, visibleChunks, visibleUnits }`), `setLocalPlayer(id)`, `dispose()`. Bucle `app.ticker` en `requestAnimationFrame`; `autoDensity: true`, `antialias: false` (los sprites están pre-suavizados; evita costos y bordes), `roundPixels: false`, `powerPreference: 'high-performance'`.

### 4.6 Terreno: chunks y splatting sin bordes (`render/terrain/`)

**Datos** (`TerrainMap`, cliente, **no autoritativo**): `W×H` tiles con `kind: Uint8` (0 pasto, 1 tierra, 2 arena, 3 roca/ceniza) y `blocked` de la sim (`SimConfig.map.blockedRle`; tiles bloqueados → capa 3 como marcador visual). En F2 la asignación de tipos la genera `terrainGen.ts` con ruido de valor sembrado (`createPrng(seed ^ 0x7e44a1)` de `shared`) — es **solo presentación**: no influye en la sim ni en el hash. En F3 el generador de mapas (`content-designer`) extiende `MapSpec` con tipos reales; `TerrainMap` es la frontera.

**Textura de pesos** (`splat`, RGBA8, tamaño `(W+1)×(H+1)`, **un texel por vértice de tile**): `w_k(i,j)` = fracción de los 4 tiles adyacentes al vértice `(i,j)` que son de la capa `k` (k=0..3 en R,G,B,A), cuantizada a 8 bits. Filtro `LINEAR`, `CLAMP_TO_EDGE`, sin mipmaps. Las UV son `((gx + 0.5) / (W+1), (gy + 0.5) / (H+1))` para que los centros de texel caigan sobre los vértices: la interpolación bilineal produce **mezcla continua entre tiles** (no hay "bloques").

**Capas**: 4 texturas tileables (`ground0..3.png`, 512×512, `REPEAT`, mipmaps, potencia de 2) muestreadas en **espacio de rejilla** con período `TERRAIN_TEX_PERIOD_TILES = 4` (`uv = g / 4`) → el patrón es continuo a través de tiles, chunks y la proyección (no hay textura por tile ni por chunk, por lo que no existen costuras). Máscara de ruido: `noise.png` (256×256, tileable, RGBA = 4 ruidos independientes, `REPEAT`) muestreada con período 8 tiles y con una segunda octava a 1,7× (período no múltiplo → sin repetición evidente).

**Fragment shader** (GLSL ES 3.00; Pixi v8 `GlProgram`; fuente en `splat.frag.glsl.ts`):

```
w  = texture(uSplat, vSplatUV)                   // pesos bilineales
n  = texture(uNoise, vGrid / 8.0) * 0.6 + texture(uNoise, vGrid / 4.7).bgra * 0.4
s  = w + (n - 0.5) * uNoiseAmp                  // uNoiseAmp = 0.45; perturba el reparto de forma orgánica
s  = pow(max(s, 0.0), vec4(uSharp))             // uSharp = 3.0; "height blend": bordes de mezcla ni lineales ni duros
w2 = s / max(dot(s, vec4(1.0)), 1e-4)
c  = w2.r*texture(uG0, vGrid/4.0) + w2.g*texture(uG1, vGrid/4.0) + w2.b*texture(uG2, vGrid/4.0) + w2.a*texture(uG3, vGrid/4.0)
```

Constantes `uNoiseAmp`, `uSharp` son de **presentación** (módulo de render, no balance). Sin normal maps ni sombreado por elevación en F2 (equivale a Calidad "Baja" del GDD §15.4; normal map/elevación → Fase 6, anotado como diferido, no baja el criterio de F2 "sin bordes visibles").

**Malla**: un `Mesh` por chunk con 4 vértices (quad que cubre `min(16, W - cx·16) × min(16, H - cy·16)` tiles). Atributos: `aPosition` (px de mundo, ya proyectados con `gridToWorld`) y `aGrid` (gx, gy en tiles). Todos los chunks comparten **un solo** `Shader`/uniforms/texturas → 1 draw call por chunk visible. Los vértices compartidos entre chunks vecinos tienen coordenadas idénticas (enteros × 64 / 32, exactas en float32). Presupuesto: mapa 128×128 → 64 chunks; visibles típicos 12–24.

**Criterio "sin bordes de tile visibles" — definición operativa** (verificable por Q3): en una captura de terreno plano a los 3 zooms, la **energía de gradiente** medida sobre las líneas de borde de tile y de chunk (proyectadas) no excede en más de 15 % la medida sobre líneas paralelas desplazadas medio tile (`ratio ≤ 1,15`), y revisión visual del `reviewer` sobre las capturas.

### 4.7 Sprites de unidad (`render/entities/unitLayer.ts`)

- Un par de `Sprite` por ranura viva visible: `body` (colores completos) y `team` (máscara blanca de las zonas de equipo, `tint = playerColors[owner]`); ambos de la misma textura atlas → 1 batch. Ancla `(0.5, 0.88)` en el pie; tamaño de marco 64×96 px a zoom 1.
- Dirección: `dirs = 8` (provisional; el formato admite 16 para F6). `dir = (((facing * dirs) + 512) >> 10) % dirs`. **Convención**: el ángulo de la sim 0 = +x de rejilla, crece hacia +y; el generador del atlas (§9) dibuja la dirección `k` apuntando al vector de pantalla de `(cos, sin)` de rejilla del ángulo `k·1024/dirs`, es decir `screenVec = (dx - dy, (dx + dy) / 2)`.
- Selección: anillo elíptico en `decals` con radio de los datos (`radiusFx` de `SimData`/`units.json`): semiejes calculados por `iso.ts` (`ellipseForRadius(radiusFx)`: un círculo de radio `r` tiles se proyecta a una elipse con `rx = r × 64 × √2` y `ry = rx / 2`).
- Pool preasignado por ranura con crecimiento perezoso; las ranuras muertas ocultan sus sprites sin destruirlos. Sin asignaciones por frame en régimen estacionario.
- Visión: una unidad con `owner` ≠ jugador local y aliados solo es visible si su tile está **visible** en la niebla (§7).

---

## 5. Picking y selección (`input/picking.ts`, `input/selection.ts`; carril U)

- Entrada: `SnapshotView` + `camera`/`viewport` + posición interpolada del frame vigente (misma que el render: `interpolatedPos(view, slot, alpha)` exportada por `render/iso.ts`, sin Pixi).
- `pickPoint(view, cam, vp, sx, sy, opts): eid | null`: elipse de golpe de cada unidad viva visible (`rx = 0.5 × 64 px` mínimo y escalada por radio; `ry = rx × 1,5` para cubrir el torso), candidatas ordenadas por `depthKey` descendente (la de más al frente primero); gana la primera cuyo punto esté dentro. Respeta niebla (enemigas no visibles no se pican).
- `pickBox(view, cam, vp, rect, opts): eid[]`: unidades **propias** cuyo ancla (pie) cae en `rect`; si el rect < 4 px se trata como clic. Solo `owner === localPlayer` (las enemigas solo se seleccionan por clic, de a una, como en AoE2).
- Tope de selección: `selection.maxUnits` en `packages/data/json/game.json` (**200** en F2: el GIF del devlog exige 100; el panel de GDD §13.2 muestra hasta 60 iconos y un "+N"; el límite real de comando es `MAX_CMD_UNITS = 1024`, ADR-005/M4). El orden de `eid[]` es ascendente.
- Shift + clic añade/quita; doble clic o Ctrl + clic = todas las del mismo `typeId` propias **en pantalla** (usa `culling` del viewport).
- Costo: `pickBox` es O(highWater) por evento de arrastre (≤ 4096 → < 0,1 ms); sin estructura espacial en F2.

## 6. Órdenes, marcador y grupos (carril U)

- Clic derecho (`orders.ts`): `target = gridToFx(screenToGrid(...))` acotado a `[0, W·1000-1]`; construye `Command` **exacto de `@reinos/shared`**: `{ turn: 0, playerId: localPlayer, type: 'move', unitIds: selection (ordenados asc), target: { kind: 'pos', x, y }, payload: null }`; valida con `validateCommandShape` antes de enviar; si la selección supera `MAX_CMD_UNITS` se parte en comandos de ≤ 1024. `A`+clic (atacar-mover), patrulla y demás: fuera de F2 (la sim solo tiene `move`/`stop`). `S` envía `stop`.
- Marcador: `markers.ts` crea **inmediatamente** (mismo frame) un anillo expansivo (600 ms, pool de 8) en `decals` en el punto objetivo (posición del puntero proyectada, sin esperar a la sim). Métrica: `inputToMarkerMs` (evento `pointerdown` → fin del `render()` que lo muestra) ≤ 1 frame.
- Grupos: `Ctrl+0–9` guarda la selección actual (eids) en memoria de `controlGroups`; `0–9` la selecciona filtrando por vivos (`isAlive` contra el snapshot: `gen` coincide y flag alive); doble pulsación (< 300 ms) centra la cámara en el centroide. Riesgo conocido: algunos navegadores reservan `Ctrl+1–8` (cambio de pestaña) y no permiten `preventDefault`; el mapeo de teclas es una tabla de `input/keymap.ts` (rejilla configurable, GDD §13.3) y se registra como riesgo abierto con alternativa `Alt+dígito`.

---

## 7. Niebla de guerra y minimapa (carril R2)

### 7.1 Decisión: la rejilla de visibilidad vive en el **cliente** en F2

**Decisión.** `VisionGrid` es un módulo **puro** (`render/fog/visionGrid.ts`) que se alimenta del snapshot, solo con **enteros** (radio en tiles de `units.los`, disco por `dx²+dy² ≤ r²` sobre centros de tile, conteos `Uint16`), **sin** Pixi, DOM, tiempo ni floats. En F2 el estado de niebla **no entra** al hash ni al `SimConfig`, y afecta **solo al render** (ocultar enemigos, oscurecer).

**Justificación según determinismo:**

1. _Qué exige el determinismo._ Todo lo que alimenta decisiones de juego (objetivos de ataque, IA que "ve", victoria, comandos que dependen de visibilidad) debe vivir en la sim y entrar al hash, porque si dos clientes calculan visibilidad distinta divergen. En F2 **nada** de la sim lee visibilidad (no hay combate ni IA; las órdenes `move` no dependen de ella), por lo que calcularla en el cliente es seguro: un error de niebla produce un error visual, nunca un desync.
2. _Coste y riesgo si se hiciera ahora en la sim._ Añadiría columnas/rejillas al hash (cambia `hashFull`, golden y `REPLAY_FORMAT_VERSION`), consumiría presupuesto de los 3 ms/tick (400 unidades × disco de ~50 casillas al cambiar de tile) y bloquearía el carril R2 detrás de cambios en `packages/sim` que hoy no tienen consumidor.
3. _Portabilidad por diseño._ El módulo cumple las reglas de `lint:sim` (enteros, sin `Math.sqrt` salvo `isqrt` de `shared`, iteración por índice ascendente) y no importa nada fuera de `shared`; su API es la que tendrá en la sim. **Migración obligatoria en F4** (combate/IA/condición de victoria leen visibilidad): se mueve a `packages/sim/src/vision/` con test de determinismo y entra al hash; el cliente pasa a **leerla** del snapshot (columna/bitset añadido a §3.2 con `version = 2`). Queda anotado en el plan de F4 como requisito, y en `contracts.md` al cerrar F2.
4. _Ambigüedad de GDD §11.3_ ("calculada en una rejilla de visibilidad por jugador con conteo de referencias"): se respeta la **estructura** (por jugador, con conteo de referencias, incremental, unión con aliados); lo único que se difiere es **dónde** corre.

### 7.2 `VisionGrid` (contrato)

```ts
export const FOG_UNEXPLORED = 0,
  FOG_EXPLORED = 1,
  FOG_VISIBLE = 2;
export class VisionGrid {
  constructor(width: number, height: number, maxPlayers: number, capacity: number);
  /** Sincroniza con el snapshot: por cada ranura viva, si cambió (tile, radio, dueño, viva) aplica el delta. */
  update(view: SnapshotView, losTilesByType: ArrayLike<number>): boolean; // true si cambió algún conteo
  refs(player: number): Uint16Array; // conteo de referencias por tile (length = W*H)
  explored(player: number): Uint8Array; // 0/1, monótono: nunca vuelve a 0
  /** Estado combinado (propio ∪ aliados) listo para render: FOG_* por tile. Se recalcula solo si update() devolvió true. */
  viewFor(playerMask: number, out: Uint8Array): void;
}
```

- Incremental: por ranura se guarda `(tx, ty, r, owner)` previos; si el tile (o `r`/`owner`) no cambió, **no se hace nada**; si cambió, se resta el disco antiguo y se suma el nuevo (discos precalculados por radio como listas de offsets `(dx,dy)` ordenadas, construidos una vez con enteros). Una unidad que muere resta su disco. Cada tile con `refs > 0` marca `explored = 1`.
- Estados (GDD §11.3): inexplorado (negro), explorado (último estado conocido, desaturado/oscurecido; en F2 solo terreno, los edificios con "último estado" llegan en F3), visible.
- Invariante testeada: tras cualquier secuencia de movimientos/muertes, `refs` es idéntica a la recomputación completa desde cero (test de propiedades, 1000 pasos, semilla fija).
- Radios y datos: `los` de `units.json` (colono = 4 tiles). No hay visión de edificios en F2 (no existen).

### 7.3 Textura y shader (`fog/fogRenderer.ts`)

- Textura `R8` de `W×H` (1 texel por tile): `0` inexplorado, `128` explorado, `255` visible (valor objetivo). El valor mostrado hace un fundido temporal en CPU: cada frame solo los texels cambiados avanzan hacia el objetivo a `FOG_FADE_PER_S = 6.0` (≈ 170 ms) y se sube la textura únicamente si hubo cambios (`texture.source.update()`), evitando 60 subidas/s.
- Overlay: **una malla** que cubre todo el rombo del mapa (4 vértices, mismas coordenadas de proyección que el terreno; UV = rejilla), mezcla `NORMAL` con `rgba = (0.02, 0.03, 0.05, a)`. Fragment: muestrea la textura con filtro `LINEAR` y un **desenfoque de 9 muestras** (cruz + diagonales a ±0,75 texel, pesos gaussianos) para bordes suaves; `a = 1.0` inexplorado, `0.55` explorado, `0.0` visible; `a = mix(...)` sobre el valor suavizado (smoothstep de 3 tramos). El efecto de "desaturado" del explorado se aproxima oscureciendo con tinte azul-gris (el desaturado real por shader de post-proceso es Fase 6).
- Entidades: enemigas/neutrales no visibles tienen `sprite.visible = false` (decisión por tile `FOG_VISIBLE` del `viewFor` del frame anterior); las propias y aliadas siempre visibles.
- Coste esperado: update O(n) por frame de render para detectar cambios de tile (barato) + O(r²) solo por unidad que cambia de tile; fundido O(texels cambiados).

### 7.4 Minimapa (`render/minimap/minimap.ts`)

- **Canvas 2D** (no Pixi), 256×128 px CSS (rombo isométrico del mapa, fondo transparente), redibujo a **10 Hz** desde `bridge`. Capas: (1) terreno base pre-rasterizado una sola vez en un `OffscreenCanvas`/`ImageData` a partir de `TerrainMap` (color medio por capa), (2) puntos de unidades 2×2 px: propias con color de jugador; enemigas **solo** si su tile es visible, (3) niebla: se pinta con la misma rejilla `viewFor` (negro/semitransparente) bajo los puntos, (4) rectángulo de la cámara proyectado como cuadrilátero (4 esquinas del viewport → rejilla → minimapa).
- Interacción: clic izquierdo/arrastre → `camera.centerOnGrid(...)`; clic derecho → orden `move` con el mismo `orders.ts`. Mapeo minimapa↔rejilla puro en `render/minimap/mapping.ts` (testeado: ida y vuelta).
- Modos de GDD (normal/combate/economía) y ping de ataque: Fases 3–4.

---

## 8. UI React y store (carril U)

### 8.1 Store de solo lectura a 10 Hz (`ui/store.ts`, `ui/bridge.ts`)

```ts
export interface GameView {
  tick: number;
  turn: number;
  selection: { count: number; byType: Record<string, number>; first60: number[] /* eids */ };
  controlGroups: Array<{ size: number }>; // 10 entradas
  camera: { zoomIndex: 0 | 1 | 2 };
  perf: { fps: number; frameMs: number; tickMs: number; drawCalls: number; mode: SnapshotMode };
  localPlayer: number;
}
// ui/store.ts exporta SOLO: useGameView(selector) y getGameView(); el setter NO se exporta.
// bridge.ts (único escritor) llama a `publish(next)` desde un setInterval de 100 ms (10 Hz) y,
// además, de inmediato ante cambios de selección (evento, nunca por frame).
```

- Los componentes React **no** modifican el estado de juego: emiten _intenciones_ mediante callbacks que el `bridge` recibe y delega en `input/` (p. ej. "seleccionar grupo 3"). Prohibido llamar a `setState` desde componentes (lo verifica un test que importa el módulo y comprueba que no exporta setter + regla ESLint sobre `ui/`).
- Re-renders: ningún componente se suscribe a algo que cambie por frame; presupuesto: React ≤ 10 renders/s (se mide con `React.Profiler` en `DevOverlay`, expuesto en `__reinos.metrics.reactRendersPerSec`).
- HUD mínimo de F2: contador y lista de selección (hasta 60 iconos + "+N"), reloj de tick, FPS/Debug overlay (tecla `F2`), host del minimapa, indicador del modo de snapshot (`sab`/`transfer`). Textos en español vía `ui/i18n.ts`. Barra de recursos, cuadrícula de comandos, colas: Fase 3.

### 8.2 Entrada (`input/pointerRouter.ts`)

El `canvas` recibe `pointerdown/move/up`, `wheel`, `contextmenu` (suprimido), `keydown/up`; React **no** interviene en la ruta de entrada (se evita el re-render y el retraso de reconciliación). El router lee el último snapshot y la cámara del frame actual. Estados: `idle`, `boxSelecting`, `panning` (botón central), `minimapDrag`.

---

## 9. Assets provisionales (carril A)

**Decisión.** Solo assets **generados proceduralmente por nosotros** con Node (sin red, sin descargas, sin CC0 externo en F2). Se descarta Kenney/Quaternius renderizado a 8 direcciones como vía de F2: no hay garantía de descarga en este entorno y añadiría dependencia de licencias; queda como opción de la puerta humana de Fase 6 (compra/aprobación de packs). Cumple las reglas: cero material de AoE; cada archivo registrado en `ASSETS_LICENSES.md` (licencia "Propio", fuente = script generador, fase 2).

**Generador** (`tools/asset-pipeline/src/provisional/`, comando raíz `pnpm assets:gen`, enganchado a `predev`/`prebuild` del cliente y a `e2e:render`): usa `createPrng(semilla fija)` de `@reinos/shared` y `pngjs`; zlib nivel fijo → **salida byte-idéntica** entre ejecuciones (hash de cada PNG verificado en un test de `tools/asset-pipeline`).

Salidas en `packages/client/public/assets/provisional/` (ignoradas por git salvo `manifest.json` y su hash; se regeneran en build):

| Archivo                     | Contenido                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ground0.png … ground3.png` | 512×512 **tileables** (pasto, tierra, arena, roca/ceniza): ruido de valor periódico multi-octava + moteado, paleta sobria; sin costuras (el generador usa coordenadas toroidales; test: diferencia entre bordes opuestos < umbral).                                                                                                                      |
| `noise.png`                 | 256×256 tileable, 4 canales de ruido independientes (máscara del splatting)                                                                                                                                                                                                                                                                              |
| `units.png` + `units.json`  | Atlas (formato spritesheet de Pixi) con marcos de 64×96: por apariencia (`civil`, `infantry`, `ranged`, `cavalry`, `generic`) × 8 direcciones × (idle ×1 + walk ×4) × {`body`, `team`}. Siluetas "capsula + cabeza + indicador de dirección" dibujadas con rasterizador propio (elipses/segmentos con antialiasing), sombra elíptica incluida en `body`. |
| `ui.png` + `ui.json`        | Anillo de selección, marcador de orden (4 cuadros), punto de minimapa                                                                                                                                                                                                                                                                                    |
| `manifest.json`             | `{ version, dirs: 8, anim: { idle: 1, walk: 4 }, frameSize: [64,96], appearances: { <sprite id de units.json>: <apariencia> }, files: {sha256} }` validado con Zod (`assets/manifest.ts`)                                                                                                                                                                |

Nombre de marco: `<apariencia>/<body|team>/<dir>/<idle0|walk0..3>`. El cliente resuelve `units.json[i].sprite` → apariencia con `manifest.appearances`; id desconocido → `generic` (sin fallo). Colores de jugador (`playerColors`, 8 entradas) en `render/constants.ts` como preferencia visual.

---

## 10. Cómo se prueba sin GPU real (carril Q)

### 10.1 Qué se mide y qué NO se afirma

El entorno de CI/sesión **no tiene GPU**. Chromium headless corre WebGL por **software (SwiftShader)**: sirve para (a) capturas deterministas, (b) pruebas funcionales (selección, niebla, interpolación), (c) medir costes **de CPU/JS** y **conteos de trabajo de GPU** (draw calls, triángulos, píxeles), (d) detectar regresiones relativas de FPS. **FPS en SwiftShader no equivale al hardware de referencia** (portátil con GPU integrada Iris Xe / Radeon 680M, Chrome; GDD §17.1): la rasterización por CPU suele ser más lenta que una iGPU en fill-rate y más rápida en overhead de comandos, por lo que el número absoluto no se traslada en ninguna dirección con garantías.

**Por tanto el criterio "400 unidades a ≥ 60 fps en el hardware de referencia" se verifica con un _proxy documentado_ y queda con un `TODO-HUMANO` hasta medirlo en hardware real. No se marca "cumplido" solo con el proxy.**

### 10.2 Proxy documentado (`pnpm perf:render` → `docs/progress/fase-02/media/perf.md` + `perf.json`)

Escenario fijo: mapa 128×128, 400 unidades en movimiento (2 jugadores), cámara en zoom 1 centrada en la mayor concentración, viewport 1280×720, 10 s tras 3 s de calentamiento; Chromium con `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --disable-gpu-vsync --disable-frame-rate-limit`; modos `sab` y `transfer`; zooms 0,6/1/1,4.

| Métrica del proxy                                                                               | Umbral (gate)                                                                       | Qué demuestra / límite                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `updateMs` p95 (JS por frame: interpolar + culling + zIndex + niebla + sprites, **sin** raster) | ≤ **4 ms** (24 % del presupuesto de 16,6 ms)                                        | El trabajo de CPU del cliente deja ≥ 4× de margen para el driver/GPU. Es heurística: no mide la GPU.                         |
| Draw calls por frame (contador por _monkey patch_ de `drawElements/drawArrays` en el contexto)  | ≤ **60** (chunks visibles + 1–3 batches de sprites + niebla + decals)               | Trabajo de comandos acotado; una iGPU maneja ≫ 60 draw calls a 60 fps.                                                       |
| Sprites dibujados por frame                                                                     | informativo (≤ 800)                                                                 | Verifica el culling y el batching.                                                                                           |
| Píxeles escritos por frame (estimación = Σ área de capas visibles; overdraw medio)              | informativo, overdraw ≤ 3×                                                          | Aproxima el fill-rate; compárese contra hoja de la iGPU en la revisión humana.                                               |
| FPS en SwiftShader a 1280×720                                                                   | **informativo**; gate **relativo**: no bajar > 20 % respecto a `perf-baseline.json` | Detecta regresiones. Si resultara ≥ 60 fps incluso en software, es evidencia **a fortiori**; si no, no invalida el criterio. |
| `tickMs` p95 del worker con 400 unidades                                                        | ≤ 3 ms (GDD §15.2 / F1)                                                             | Confirma que el worker en navegador no degrada la sim (mide con `perf` de §3.1).                                             |
| Snapshots omitidos / `ticksDropped`                                                             | 0 en régimen estacionario                                                           | El pacing y el reciclado funcionan.                                                                                          |

`TODO-HUMANO` (se lista en `STATUS.md`): ejecutar `/?perf=400&debug=1` (o `pnpm preview` + página `perf.html` del mismo build) en el portátil de referencia con Chrome, 60 s, y pegar el JSON que genera el overlay (`__reinos.perfReport()`); aceptación: p5 de FPS ≥ 60 en Alta, 400 unidades, zoom 1. Hasta entonces el criterio figura "proxy verde + hardware real pendiente".

### 10.3 Tests unitarios en Node (Vitest, entorno `node`, sin Pixi ni DOM)

| Archivo (`packages/client/test/`) | Verifica                                                                                                                                                                                                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render/iso.test.ts`              | `worldToGrid(gridToWorld(g)) ≈ g` (propiedad, 10⁴ casos); esquinas: `(0,0)→(0,0)`, `(W,0)→(W·64, W·32)`; centro de tile; relación 2:1 (`Δwx/Δwy` de una arista); `gridToFx` redondeo y acotado; zoom anclado al cursor.                                                                |
| `render/culling.test.ts`          | `visibleTileRange` ⊇ conjunto exacto por fuerza bruta (10⁴ cámaras/zooms/mapas aleatorios) y no mayor que +margen; `visibleChunks` correcto en bordes del mapa y mapas no múltiplos de 16; AABB de sprite.                                                                             |
| `render/depth.test.ts`            | Orden estable; una unidad "más al sur" (mayor x+y) tapa a la anterior; empates por ranura.                                                                                                                                                                                             |
| `render/fog/visionGrid.test.ts`   | Tamaño de discos (r=1..12) = esperado entero; suma/resta simétrica; unidad que se mueve explora y no "desexplora"; unión con aliados; incremental ≡ recomputación completa (propiedad); muerte resta; 400 unidades `update` ≤ 1 ms.                                                    |
| `input/picking.test.ts`           | `pickPoint` elige la más al frente; no pica enemigas en niebla; `pickBox` solo propias; clic vs caja (umbral 4 px); tope de selección por datos; doble clic = mismo tipo en pantalla.                                                                                                  |
| `input/orders.test.ts`            | Comando generado pasa `validateCommandShape`; `turn: 0`; unitIds ascendentes; partición en 1024; objetivo acotado al mapa.                                                                                                                                                             |
| `worker/snapshot.test.ts`         | Round trip writer→reader en **ambos** modos; layout (`snapshotLayout`) alineado y sin solapes; triple buffer: simulación de escritor/lector entrelazados (intercalado exhaustivo de pasos) nunca lee una ranura en escritura.                                                          |
| `worker/host.test.ts`             | Con reloj falso: 20 ticks/s a speed 1; comandos solo en frontera de turno y con `turn` reescrito; latencia orden→primer movimiento ≤ 5 ticks; `hash` por turno **igual al de `createSim` + `step` en Node** (mismo escenario/semilla) ; descarte de comandos mal formados; pausa/step. |
| `ui/store.test.ts`                | El módulo no exporta setter; `publish` limita a 10 Hz (reloj falso); selección publica inmediato.                                                                                                                                                                                      |
| `assets/manifest.test.ts`         | `manifest.json` válido; todos los marcos referenciados existen en `units.json`; PNG del generador byte-idénticos entre dos ejecuciones; texturas tileables (borde opuesto).                                                                                                            |

### 10.4 Playwright con SwiftShader (`playwright.render.config.ts`, specs en `e2e/render/`, `pnpm e2e:render`)

- Mismo patrón que `playwright.det.config.ts`: Chromium preinstalado (`/opt/pw-browsers/chromium`, `CHROMIUM_PATH`), `--no-sandbox`, **sin** `playwright install`; sirve `vite preview` con las cabeceras COOP/COEP (modo `sab` real) y una segunda ejecución con `?snap=transfer`. Firefox/WebKit no aplican en F2 (no hay navegadores en el entorno); el render se verifica solo en Chromium y se anota como límite.
- API de pruebas `window.__reinos` (solo con `?debug=1` o `DEV`): `ready`, `tick`, `lastTurnHash`, `metrics` (`updateMs`, `drawCalls`, `inputToMarkerMs`, `reactRendersPerSec`, `mode`), `camera` (get/set), `select(eids)`, `units()` (posiciones proyectadas a pantalla), `fogState(tx,ty)`, `screenOfTile(tx,ty)`, `perfReport()`, `loadScenario(name)`. Las capturas usan `page.screenshot` con la cámara y el escenario fijados por esta API (semilla fija → imágenes deterministas bajo el mismo SwiftShader).
- Specs: `smoke.spec.ts` (carga, WebGL activo, `ready`), `terrain.spec.ts` (capturas por zoom + métrica de costuras con `pngjs`), `fog.spec.ts` (3 estados y píxeles), `select-move.spec.ts` (100 unidades: caja, clic derecho, llegada; latencia de feedback; captura de frames para el GIF), `perf.spec.ts` (proxy §10.2; escribe `perf.json`/`perf.md`), `determinism-worker.spec.ts` (hash por turno del Worker == Node).
- Capturas y GIF: `page.screenshot` en `docs/progress/fase-02/media/*.png`; el GIF de 100 unidades se arma con los frames capturados a intervalos fijos (`gifenc`; o `ffmpeg` si existe). Los especs fallan si el `console` registra errores WebGL/Pixi.

---

## 11. Propiedad de archivos (para el trabajo en paralelo)

| Carril | Dueño                                     | Edita                                                                                     | NO edita                                     |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| T0     | `render-engineer`                         | `package.json`, `vite.config.ts`, `tsconfig.json`, ESLint del cliente, stubs de contratos | —                                            |
| W      | `sim-engineer`                            | `client/src/worker/**`, `client/test/worker/**`; (y `shared`/`sim`/`data` solo en S1–S3)  | `render/`, `input/`, `ui/`                   |
| R      | `render-engineer`, `render-engineer (2º)` | `client/src/render/**`, `client/src/assets/loader.ts`, `client/test/render/**`            | `worker/`, `input/`, `ui/`                   |
| U      | `ui-engineer`                             | `client/src/{input,ui}/**`, tests espejo                                                  | `render/`, `worker/` (consume sus contratos) |
| A      | `art-pipeline`                            | `tools/asset-pipeline/**`, `client/src/assets/manifest.ts`, `ASSETS_LICENSES.md`          | `render/`                                    |
| Q      | `qa-engineer`                             | `e2e/render/**`, `playwright.render.config.ts`, `boot/debug.ts` (con R), scripts de perf  | código de producto salvo `boot/debug.ts`     |

`packages/data/json/game.json` (bloques `camera`, `selection`): lo edita `content-designer` en T-D1 (una sola vez, antes de U1/U2). Cambios a `protocol.ts`/`snapshot.ts` solo por enmienda de este ADR.

## Alternativas consideradas

- **Sim en el hilo principal.** Descartada: GDD §15.2 y §17.1 fijan el Worker; compite con el render por los 16,6 ms.
- **Solo `postMessage` con copia estructurada (sin buffers transferibles).** Descartada: GC y copias por snapshot; el layout de typed arrays cuesta lo mismo y permite SAB sin reescribir.
- **Solo `SharedArrayBuffer`.** Descartada: exige COOP/COEP; en cualquier despliegue/entorno sin cabeceras no funcionaría. Se mantiene el fallback.
- **Snapshot compacto por entidades viva (no por ranura).** Descartada: obliga a mapeo eid→sprite por frame; el layout por ranura ocupa un poco más pero simplifica pool, picking y niebla.
- **Texturas de terreno horneadas por chunk (RenderTexture).** Descartada: 2048×1024 px por chunk a zoom 1 (≈ 8 MB cada uno; >500 MB para 64 chunks) y costuras de filtrado; el shader en espacio de rejilla usa memoria constante.
- **Niebla en la sim ya en F2.** Diferida (ver §7.1), con migración obligatoria en F4.
- **Minimapa con Pixi/RenderTexture.** Descartada: un Canvas 2D a 10 Hz es más simple, no compite por el contexto GL y se prueba sin GPU.
- **Estado de la UI en React (context/useState por frame).** Descartada por GDD §13.2: el HUD lee un store a 10 Hz.
- **Assets CC0 de Kenney/Quaternius en F2.** Descartada por falta de garantía de descarga y de la herramienta de render a 8 direcciones; la generación procedural es 100 % reproducible y sin riesgo de licencia.
- **Render WebGPU.** Fuera de alcance de F2 (inestable en software/CI); el contrato de capas y shaders no lo impide.

## Consecuencias

- Los carriles dependen solo de `protocol.ts`, `snapshot.ts`, `iso.ts`/`camera.ts`, `visionGrid.ts` y el manifiesto de assets: se pueden desarrollar contra sus stubs de T0.
- `packages/sim` **no cambia** por la F2 (salvo S1: `simDataHash`, hardening de R1/F1); el golden de determinismo no cambia.
- La niebla del cliente tendrá que migrar a la sim en F4 (coste conocido y registrado).
- El criterio de 60 fps queda con una parte en puerta humana; el proxy da regresiones y trabajo acotado, no una garantía.
- Los shaders son GLSL (WebGL); un futuro renderer WebGPU requeriría WGSL.
- El terreno F2 es plano y de 4 capas: normal maps, elevación y agua llegan en Fase 6/3 sin cambiar el contrato de chunks (la malla de 4 vértices pasará a rejilla subdividida al introducir elevación).

## Riesgos abiertos

1. SwiftShader puede no soportar alguna característica usada por Pixi v8 (p. ej. mipmaps NPOT, `texImage3D`); mitigación: texturas POT, renderer `webgl` (WebGL2) y smoke temprano en T0/Q1.
2. `Ctrl+1–8` reservado por el navegador (ver §6).
3. Compatibilidad `@vitejs/plugin-react` con Vite 8 (verificar peer deps en T0; si falla, fijar `vite` a la versión soportada con ADR menor).
4. COEP `require-corp` en dev/preview: cualquier recurso externo rompe el aislamiento; los assets son locales (§9).
5. La métrica de costuras (§4.6) es una definición operativa, no perceptual; se completa con revisión visual.
6. `simDataHash` (H3) existe desde S1: el host lo calcula, lo informa en `ready.simDataHash` y rechaza el `init` si `init.simDataHash` o `config.simDataHash` no coinciden (el tipo conserva `number | null` por compatibilidad). `turn` incorpora `skippedUnits` (S3, diagnóstico, fuera del hash).

## Estado

Propuesto. Se acepta tras la revisión R1 de Fase 2 (diseño) y se enmienda aquí cualquier cambio de contrato durante la fase.

## Nota T0 (2026-11-21) — smoke de Pixi v8 bajo SwiftShader

Riesgo abierto 1 **resuelto en lo esencial**: PixiJS 8.23.0 con `preference: 'webgl'` inicializa **WebGL2** en Chromium headless (SwiftShader/ANGLE-Vulkan: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`), compila un shader GLSL ES 3.00 propio (`GlProgram`, atributos `aPosition`/`aGrid`) y dibuja un `Mesh` correctamente (e2e `e2e/render/gl-smoke.spec.ts`, píxeles exactos del tablero rojo/verde). No hace falta fallback WebGL1/canvas. Detalles y flags en `docs/progress/fase-02/swiftshader.md`.

Ajustes de contrato por T0 (sin cambiar semántica):

- `SnapshotView` y el resto de tipos del snapshot viven en `worker/snapshot.ts` (reexportados desde `worker/client.ts`), para que `render/` y `input/` no necesiten importar `worker/client` (la tabla de §2 solo permite `worker/snapshot` a `render/`).
- `render/types.ts` (nuevo, puro): `Camera`, `Viewport`, `Vec2`, `TileRange`, `ZoomIndex`; `render/constants.ts` también expone `PLAYER_COLORS`, `FOG_FADE_PER_S`, `TERRAIN_TEX_PERIOD_TILES`.
- `ReadyInfo`/`PerfInfo`/`PostFn` se declaran en `worker/protocol.ts`.
- Config de pruebas de render: `playwright.render.config.ts` (puerto 4174, `vite preview` con COOP/COEP); la config principal ignora `e2e/render/`. Se mantiene el Vitest del cliente en `vitest.config.ts` propio (Vitest 2 trae Vite 5; la app usa Vite 8 + plugin-react 6).
- `@vitejs/plugin-react@6.3.0` declara peer `vite ^8.0.0`: compatible con Vite 8.3.8 (verificado con build).
- Las reglas de §2 se aplican con `@typescript-eslint/no-restricted-imports` en `eslint.config.js` (bloque `clientBoundaries`, con `allowTypeImports`) y con `packages/client/test/deps.test.ts`.
- Página `gl-smoke.html` (entrada extra de `vite build`) es solo del smoke de T0; Q1 puede retirarla cuando `smoke.spec.ts` cubra lo mismo.

## Enmiendas del carril W (2026-11-21, sim-engineer, W1–W3)

Desvíos respecto al contrato de §3, todos compatibles hacia atrás para los demás carriles (solo añaden campos opcionales o precisan ambigüedades):

1. **`init` gana dos campos opcionales** (`protocol.ts`): `dataVersion?: string` (el `DATA_VERSION` del cliente; `SimHost` responde `error` y no arranca si difiere del suyo, regla 1 de §3.1) y `paused?: boolean` (arrancar en pausa; los tests deterministas conducen la sim con `ctl step`). `SimClient.start` acepta `paused` y siempre envía `dataVersion`.
2. **`perf` gana `snapsSkipped`** (publicaciones omitidas por falta de buffer libre en `transfer`; estacionario 0). Resuelve la ambigüedad de §3.3 ("omite" vs "asigna uno nuevo"): se **omite** (nunca se asignan buffers extra) y la publicación omitida se **reintenta** en el siguiente `pump` aunque la sim no avance (si no, tras una pausa el render podría quedarse con un snapshot viejo).
3. **Orden de mensajes en el arranque:** el snapshot del tick 0 se publica **antes** de `ready` (en `transfer`: `snap` y luego `ready`). Así `ready` significa "ya hay snapshot que leer" y `latest()` no es `null` al resolverse `start()`. `SimClient` crea la fuente de snapshots en `start()` (la capacidad es `config.maxEntities`), no al recibir `ready`.
4. **Errores del host no lanzan:** un segundo `init`, un `dataVersion` distinto, un `SimConfig` inválido o una excepción en el tick se informan como `{t:'error'}` (el host nunca lanza desde `onMessage`/`pump`; ante una excepción de tick el host queda en pausa). `SimClient.start` rechaza si el error llega antes de `ready`.
5. **`turn` del mensaje `turn`** es el índice (0-based) del turno **ejecutado** (`sim.turn - 1` tras completarlo), igual que `TurnResult.turn` de `step`; el hash es `sim.hash()` al cierre del turno, idéntico al de `createSim + step`. `rejected` cuenta los comandos que el **host** descarta (forma inválida, `playerId >= maxPlayers`, `cmd.cmds` que no es array) desde el último mensaje `turn`; `stepTick` no expone el contador de rechazos de `applyCommands` (los rechazos "enteros" por unidad llegan con T-extra, §plan 203).
6. **Transporte `sab`:** el hilo principal crea el buffer con `createSharedSnapshotBuffer(capacity)` (control `latest = reading = -1`). Ambos lados del triple buffer están escritos como máquinas de pasos (`tripleWriterStep` / `tripleReaderStep`, una operación atómica por paso) para poder enumerar **todas** las intercalaciones en el test (`snapshot.test.ts`, exploración exhaustiva memoizada + test de mutación que demuestra que el verificador detecta un escritor que ignora `reading`). Con `crossOriginIsolated` falso, `SimClient` usa `transfer` aunque se pida `sab`.
7. **Interpolación:** además del contrato de §3.7 (que el `Renderer` puede inlinear) se publican helpers puros en `worker/interpolation.ts` (`interpAlpha`, `isDiscontinuity`, `interpolateSlot`); `maxJumpFx` entra como parámetro (la constante `MAX_INTERP_JUMP_FX = 4000` sigue viviendo en `render/constants.ts`).
8. **Archivos añadidos fuera de la lista de §2:** `worker/checksum.ts` (FNV de columnas de snapshot, para comparar navegador y Node), `worker/smoke.ts` + `worker/smokeConfig.ts` (script de la página de e2e, sin DOM: usa `globalThis` y `location`), `packages/client/worker-smoke.html` y **una línea** en `packages/client/vite.config.ts` (`rollupOptions.input['worker-smoke']`), análoga a `gl-smoke`. `SimClient` acepta `createSimClient({ createWorker, now })` para cablearlo a un `SimHost` en proceso (tests en Node).
9. **Escenarios (W3):** `buildScenario(name, seed)` usa el PRNG de `@reinos/shared` (fuera de la sim); `demo100`/`demo400` = mapa 128×128, 6 lagos (elipses) + 40 claros de bosque bloqueados vía `blockedRle`, márgenes libres alrededor de cada ejército, 2 jugadores, 50/200 unidades por jugador en cuadrícula de 1 casilla (filas `recluta`/`arquero`/`jinete_ligero`), `maxEntities = 1024`. Hash pineado tras 200 ticks (orden de mover 20 unidades en el turno 0): `demo100 = 2552486542`, `demo400 = 4096375533` (cambia solo si cambia el generador, `SimData` de balance o la sim; entonces es un cambio deliberado y se repinea en `scenarios.test.ts`).

## Enmiendas R1–R3 (render-engineer, 2026-11-21) — proyección, cámara, terreno por chunks y capa de unidades

Implementado en `packages/client/src/render/{iso,camera,culling,depth,renderer}.ts`, `render/terrain/**`, `render/entities/**` (+ `render/harness/**`). Cambios de contrato respecto del texto de arriba (todos aditivos salvo donde se indica):

1. **`Camera.anchor`** (`render/types.ts`): campo opcional `ZoomAnchor { dx, dy, wx, wy }` (punto de mundo bajo el cursor y su offset al centro del viewport). `setZoomAnchored` lo fija; `stepZoom(cam, dtMs, tauMs)` reposiciona `cam.x/y` en cada paso para que el punto no se mueva durante la animación **sin necesitar el viewport** (la firma de §4.2 no cambia). Se limpia al asentarse el zoom. `centerOnGrid/centerOnFx` también lo limpian. `clampCamera` acota en espacio de rejilla (rectángulo `[-m, W+m] × [-m, H+m]`, equivalente exacto al rombo expandido).
2. **`iso.ts`**: además de §4.1 exporta `interpolatedInto(out, view, slot, alpha)` (sin asignaciones; `interpolatedPos` es su envoltorio) e `interpolationAlpha(nowMs, arrivalMs, tickIntervalUs)` (§3.7). `culling.ts`: `visibleTileRange` devuelve índices **inclusivos** y un rango vacío (`x1 < x0`) si el viewport no toca el mapa; `visibleChunks` propaga el vacío.
3. **`RendererOptions` / `Renderer`** (`createRenderer` es **async**; Pixi `init` lo es):
   - se **retira** `data: GameData`; entran `zoomTauMs` (lo pasa la integración desde `game.json camera.zoomTauMs`; el render no lleva constantes de datos), `unitRadiusFx: ArrayLike<number>` (`SimData.radiusFx`, para los anillos), y opcionales `terrainTextures`, `unitAtlas`, `hardTerrainTiles` (solo control de la métrica de costuras), `background`;
   - `simClient` se tipa como `SnapshotFeed = Pick<SimClient, 'latest' | 'latestArrivalMs'>` (los tests/arnés pasan un feed falso);
   - `Renderer` añade `stop()`, `frameOnce()`, `viewport`, `layers {terrain, decals, entities, fog}` (la capa `fog` queda **vacía** para el carril R6), `world` (contenedor que lleva pan/zoom), `localPlayer`, `setSelected(eids)` (anillos; la selección es del carril U) y `spawnMarker(gx, gy)`; `stats` añade `renderMs`, `visibleRings`, `frames`.
   - **Bucle propio en `requestAnimationFrame`** en vez de `app.ticker` (`Application` con `autoStart: false`): permite medir `updateMs` (JS de interpolar + culling + sprites, sin rasterizar) separado de `renderMs` (envío de Pixi). `drawCalls` = llamadas `gl.draw*` del frame anterior (monkey patch del contexto, restaurado en `dispose`).
4. **Puntos de integración con el carril A** (limpios, sin tocar `assets/`): `TerrainTextures { ground: [Texture×4], noise: Texture }` en `render/terrain/textures.ts` (`prepareGroundTexture`/`prepareNoiseTexture` ponen REPEAT+mipmaps al cargar `ground0..3.png`/`noise.png`) y `UnitAtlas { dirs, body(typeId,dir,anim), team(typeId,dir,anim), bodyTint(typeId), destroy() }` en `render/entities/atlas.ts` (anim 0 = idle, 1..4 = walk; A3 lo implementa desde `units.json`+`manifest.json`; con arte real `bodyTint` devuelve `0xffffff`). Hasta entonces el render usa **texturas procedurales en memoria** (`terrain/procGen.ts`: suelo 512² y ruido 256² toroidales, `entities/procSprites.ts`: atlas 320×1536 de 8 direcciones × (idle + 4 walk) × {body, team}), deterministas y puras (testeadas en Node). Un solo `source` de atlas para body y team.
5. **Profundidad**: capa plana con `sortableChildren`; `body` y `team` de una ranura comparten `zIndex = depthKey` y se crean juntos (a igual clave Pixi respeta el orden de inserción, así `team` queda justo sobre `body`). Aclaración de §4.4: dos unidades en el **mismo cubo de 1/8 de tile** de `x+y` (≤ 125 Fx de diferencia) desempatan por ranura, no por posición real; es el comportamiento especificado, no un defecto.
6. **Arnés de render** (nuevo, no es la API `__reinos` de Q1): `packages/client/render-harness.html` (entrada extra de `vite build`, como `gl-smoke.html`) + `render/harness/{main,fakeFeed}.ts`. `fakeFeed` es un `SnapshotView` falso determinista con el layout por ranura de §3.2 (mismo uso que tendrá el worker). Expone `window.__renderHarness` (`setCamera`, `screenOfGrid`, `collect(n)`, `feed`, `renderer`) con parámetros `units, spacing, zoom, gx, gy, moving, loop, select, ctl, bg, w, h`. Q1 puede absorber esto en `boot/debug.ts` o dejarlo como arnés del carril R.
7. **Métrica de costuras** (`e2e/render/render-seams.ts`): definición operativa de §4.6 implementada tal cual (energía de gradiente `|ΔL|` horizontal+vertical sobre líneas proyectadas gx/gy = k vs k+0,5, muestreo cada 0,02 tile). Control negativo = `?ctl=1`: pesos one-hot **por tile** con muestreo `nearest` en `floor(grid)` (tiles independientes con bordes duros).

### Evidencia (SwiftShader, Chromium headless, 1280×720, DPR 1; en una máquina compartida con otras ejecuciones)

| Medida                                            | Resultado                                                                                                                         | Umbral                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Costuras tile (ratio) zoom 0,6 / 1 / 1,4          | 0,993 / 0,980 / 0,990                                                                                                             | ≤ 1,15                         |
| Costuras chunk vs líneas de tile, 0,6 / 1 / 1,4   | 1,034 / 0,965 / 0,963                                                                                                             | ≤ 1,15                         |
| Control negativo (tiles duros), zoom 1            | 3,56                                                                                                                              | > 1,15 (el spec lo exige)      |
| Grietas entre chunks (fondo magenta en el mapa)   | 0 píxeles, 3 zooms                                                                                                                | 0                              |
| Draw calls, solo terreno (zoom 1, 4 chunks)       | 4                                                                                                                                 | = chunks visibles (≤ +3)       |
| 400 unidades en movimiento + 40 anillos, zoom 0,6 | `updateMs` p50 0,20 / p95 0,37 / max 3,75 ms; draw calls 17 (16 chunks + 1 batch); 379 visibles                                   | p95 ≤ 4 ms; ≤ 60               |
| ídem zoom 1                                       | `updateMs` p50 0,35 / p95 0,51 / max 3,39 ms; draw calls 5 (4 chunks + 1 batch); 256 visibles                                     | p95 ≤ 4 ms; ≤ 60               |
| Culling de unidades                               | 400 → 319 → 213 al pasar de zoom 0,6 → 1 → 1,4; 0 con la cámara lejos                                                             | proporcional al viewport       |
| Heap por frame (400 unidades + 40 anillos)        | 3,5 KB/frame frente a 2,5 KB/frame de la línea base solo-terreno (≈ +1 KB: contabilidad de Pixi/orden; el bucle propio no asigna) | diferencia < 2 KB (tolerancia) |

Notas y riesgos abiertos:

- `updateMs` mide solo JS; `renderMs` (JS de envío de Pixi) p95 ≈ 1,2 ms. La rasterización en SwiftShader **no** equivale al hardware de referencia (§10.1): K1 sigue siendo "proxy" + TODO-HUMANO.
- **Nitidez del suelo**: con `TERRAIN_TEX_PERIOD_TILES = 4` y texturas de 512 px, el suelo se minifica ≈ 1,8× a zoom 1 (una arista de tile mide ≈ 71,5 px en pantalla frente a 128 texels) y ≈ 3× a zoom 0,6, por lo que el trilineal lo suaviza; no hay filtrado anisótropo en el camino Pixi/WebGL por defecto. Con arte real de A1 conviene revisar el periodo (p. ej. 2 tiles) o añadir sesgo de LOD en Fase 6; no afecta a los bordes (la métrica lo confirma) pero sí a la sensación de detalle.
- Las capturas `render-*.png` de `docs/progress/fase-02/media/` son del arnés (datos y unidades falsos con atlas provisional); las capturas de devlog finales (Q4/F1) las hará la integración (I1).
- Pendiente de otros carriles: niebla (R5–R7) usa `layers.fog`; el loader de A3 debe construir `TerrainTextures` y `UnitAtlas`; la integración (I1) pasa `zoomTauMs` y `unitRadiusFx` desde `@reinos/data` y llama a `setSelected`/`spawnMarker` desde `input/`.
