# Reinos de Ceniza — Plan de desarrollo de cero a lanzamiento (Claude Code + subagentes)

Nov 21, 2026 · @GiovaG

## 1. Cómo usar este plan

Este plan lleva Reinos de Ceniza de un repositorio vacío a la versión 1.0 en 14 fases agrupadas en 5 hitos. Lo ejecuta Claude Code con Opus 5.5 como **orquestador** que delega cada tarea en **subagentes especializados**, verifica, documenta el progreso visualmente y sigue a la fase siguiente sin esperar instrucciones, salvo en las puertas humanas.

Fuente de verdad del diseño: el documento **"Reinos de Ceniza — Documento Técnico (GDD + TDD)"**. Se exporta a docs/GDD.md en la Fase 0 y todo número de balance se transcribe a packages/data/\*.json.

### 1.1 Rol del orquestador

- Lee CLAUDE.md, docs/GDD.md, docs/PLAN.md y docs/progress/STATUS.md al empezar cada sesión.

- Divide la fase en tareas con dueño (subagente), entradas, salidas y criterios de aceptación; lanza en paralelo las que no dependen entre sí.

- No escribe código grande él mismo: integra, resuelve conflictos, corre la verificación y decide.

- Mantiene STATUS.md actualizado (fase, tareas, bloqueos, próximos pasos) para poder retomar en cualquier sesión.

### 1.2 Reglas no negociables

1.  **Datos, no constantes:** ningún valor de balance en código; todo en packages/data con esquema Zod.

2.  **Determinismo primero:** nada de floats, Math.random, Date.now ni iteración de Map sin orden en packages/sim. Un lint propio lo bloquea.

3.  **Siempre jugable:** al final de cada fase, main compila, pasa tests y está desplegado en Render.

4.  **Verificar, no suponer:** cada tarea se cierra con evidencia (tests, captura, métrica). Lo que no se vio funcionar no está hecho.

5.  **Revisión adversarial:** el subagente reviewer, que no hizo el trabajo, revisa cada entrega antes del merge.

6.  **Legal:** cero assets o textos de Age of Empires; cada asset de terceros entra en ASSETS_LICENSES.md.

7.  **Progreso visible:** cada fase termina con una entrada de devlog con capturas y GIF (§5).

### 1.3 Definición de terminado (por fase)

- Criterios de aceptación de la fase cumplidos y demostrados.

- Tests verdes en CI (unitarios, determinismo, E2E de la fase), sin regresiones de rendimiento \> 10%.

- Revisión de reviewer aprobada; si la fase tiene contenido visual, puntaje visual ≥ 8 en cada eje.

- Desplegado en Render (entorno staging y, en hitos, production).

- Devlog publicado, STATUS.md y CHANGELOG.md actualizados, tag git fase-XX.

### 1.4 Puertas humanas (lo que solo vos podés hacer)

| Momento                     | Qué necesita el orquestador                                                                                | Fase        |
|-----------------------------|------------------------------------------------------------------------------------------------------------|-------------|
| Antes de empezar            | Repo en GitHub, cuenta de Render con método de pago, clúster MongoDB Atlas, variables de entorno           | 0           |
| Antes del arte final        | Comprar o aprobar packs de modelos 3D y música; decidir herramientas de IA para generar assets             | 6           |
| Antes de OAuth              | Crear apps de Google/Discord y pasar client IDs                                                            | 8           |
| Revisiones visuales de hito | Mirar el devlog y aprobar o pedir cambios (si no respondés en 24 h, se toma la recomendación del reviewer) | 3, 5, 7, 10 |
| Lanzamiento                 | Dominio, revisión legal, decisión de abrir el ranked                                                       | 13          |

Si una puerta queda pendiente, el orquestador **no se detiene**: avanza con placeholders marcados TODO-HUMANO, sigue con tareas independientes y lo reporta en STATUS.md.

## 2. Configuración de Claude Code

La Fase 0 crea esta configuración en el repo. Los subagentes viven en .claude/agents/\*.md (frontmatter con nombre, descripción, herramientas y modelo) y el orquestador los invoca por nombre.

### 2.1 Estructura del repositorio

reinos-de-ceniza/  
CLAUDE.md \# reglas para todas las sesiones  
render.yaml \# Blueprint de Render  
ASSETS_LICENSES.md  
docs/ GDD.md PLAN.md progress/STATUS.md progress/fase-XX/ adr/  
packages/  
shared/ \# tipos, protocolo, utilidades de punto fijo  
data/ \# JSON de balance + esquemas Zod + validador  
sim/ \# simulación determinista, IA, mapas (sin DOM)  
client/ \# React + PixiJS + audio + worker  
server/ \# API Express + relay WebSocket  
tools/  
asset-pipeline/ \# Blender headless, empaquetado de atlas  
headless/ \# runner de partidas, torneos IA, calibración  
devlog/ \# capturas, GIF y página de progreso  
.claude/ agents/ commands/ settings.json

### 2.2 CLAUDE.md (contenido mínimo)

\# Reinos de Ceniza — reglas del proyecto  
- Lee docs/GDD.md (diseño) y docs/progress/STATUS.md (estado) antes de trabajar.  
- Monorepo pnpm + Turborepo, TypeScript estricto. Comandos: pnpm dev \| test \| test:det \| build \| devlog.  
- packages/sim: SIN floats, Math.random, Date.now, DOM. Punto fijo (shared/fixed.ts), PRNG de la partida.  
- Valores de balance SOLO en packages/data (Zod). Nunca constantes mágicas.  
- Cada cambio de sim requiere test de determinismo (mismo hash en Node y navegadores).  
- Nada de assets/nombres/textos de Age of Empires. Registrar licencias en ASSETS_LICENSES.md.  
- Al terminar una tarea: tests, captura si es visual, actualizar STATUS.md.  
- Idioma de UI por defecto: español; código y commits en inglés.

### 2.3 Subagentes

| Subagente        | Responsabilidad                                                        | Herramientas                    | Paquetes que toca                   |
|------------------|------------------------------------------------------------------------|---------------------------------|-------------------------------------|
| architect        | Diseño técnico, ADRs, contratos entre paquetes, desglose de fases      | Read, Grep, Write (docs)        | docs/adr                            |
| sim-engineer     | ECS, punto fijo, movimiento, pathfinding, economía, combate            | Todas                           | sim, shared                         |
| render-engineer  | PixiJS, terreno, sprites, shaders, partículas, cámara, niebla          | Todas                           | client/render                       |
| ui-engineer      | React: menús, HUD, lobby, opciones, accesibilidad, i18n                | Todas                           | client/ui                           |
| netcode-engineer | Relay lockstep, lobbies, matchmaking, reconexión, repeticiones         | Todas                           | server/relay, shared                |
| backend-engineer | API Express, MongoDB, auth, rating, progresión, Render                 | Todas                           | server/api                          |
| ai-designer      | IA de reglas, build orders, dificultades, torneos                      | Todas                           | sim/ai, data/ai                     |
| content-designer | JSON de unidades, edificios, techs, facciones, mapas, campañas, textos | Read, Write, Bash               | data                                |
| art-pipeline     | Blender headless, atlas, KTX2, integración de assets, guía de estilo   | Todas                           | tools/asset-pipeline, client/assets |
| audio-engineer   | Sistema de audio, mezcla, música adaptativa, integración de sonidos    | Todas                           | client/audio                        |
| qa-engineer      | Tests unitarios, determinismo cross-browser, E2E, rendimiento, carga   | Todas                           | todos (tests)                       |
| reviewer         | Revisión adversarial de código y de capturas; puntaje visual           | Read, Grep, Bash (solo lectura) | ninguno                             |
| devlog-reporter  | Capturas, GIF, página de progreso, resumen de fase                     | Bash, Write, Playwright MCP     | tools/devlog, docs/progress         |

Ejemplo de archivo .claude/agents/sim-engineer.md:

---  
name: sim-engineer  
description: Implementa y optimiza la simulación determinista (ECS, punto fijo, movimiento, pathfinding, economía, combate). Úsalo para cualquier cambio en packages/sim.  
model: opus  
---  
Eres ingeniero de simulación de un RTS con lockstep determinista.  
Reglas: enteros en punto fijo, PRNG de la partida, iteración por id ascendente,  
valores desde packages/data. Cada cambio llega con tests unitarios y un test  
de determinismo (pnpm test:det). Mide el costo por tick con tools/headless/bench.  
Entrega: diff, tests, números de rendimiento y notas para STATUS.md.

### 2.4 Comandos personalizados (.claude/commands)

- /fase \<n\>: carga la fase n de PLAN.md, crea tareas y empieza el protocolo de §4.

- /verificar: corre lint, tipos, tests, determinismo, bench y build.

- /devlog: genera capturas, GIF y la entrada de progreso de la fase actual.

- /revisar: invoca a reviewer sobre el diff actual y las capturas.

- /estado: resume STATUS.md y lo pendiente.

### 2.5 Hooks y permisos (.claude/settings.json)

- Hook PostToolUse sobre ediciones en packages/sim: corre pnpm lint:sim (bloquea floats y APIs no deterministas).

- Hook Stop: recuerda actualizar STATUS.md si hubo cambios sin registrar.

- Permisos: permitir pnpm \*, git \* (sin push forzado), blender -b \*, npx playwright \*; pedir confirmación para borrar archivos fuera de dist/ y para despliegues a production.

### 2.6 MCP y herramientas

- **Playwright MCP** (o @playwright/test desde Bash) para capturas, GIF y E2E.

- **GitHub CLI** (gh) para PRs, issues y releases.

- **Render**: despliegue por Blueprint y API de Render vía curl con RENDER_API_KEY.

- **Blender 4.x** instalado en el entorno para el pipeline de sprites; **ffmpeg** para GIF/WebM.

## 3. Hoja de ruta

El plan tiene 14 fases en 5 hitos; cada hito termina con una versión jugable desplegada en Render y una puerta de calidad que debe pasar antes de seguir.

<img src="media/image1.png" style="width:6in;height:4.09821in" alt="hoja de ruta · 14 fases en 5 hitos, con la puerta de cada hito" />

hoja de ruta · 14 fases en 5 hitos, con la puerta de cada hito

Las fases van en orden porque cada una se apoya en la anterior, con una excepción: la compra y aprobación de assets (puerta humana de la Fase 6) conviene arrancarla en paralelo desde la Fase 2 para que el arte final no frene el Hito 3. No se ponen fechas: el ritmo depende de las sesiones de Claude Code, y el avance se mide por criterios cumplidos, visibles en /devlog.

## 4. Protocolo de ejecución de cada fase

Cada fase se ejecuta con el mismo ciclo de 8 pasos. El orquestador repite los pasos 3 a 6 hasta que todos los criterios de aceptación pasen: "no detenerse" significa no cerrar la fase con criterios en rojo ni pedir permiso para seguir.

1.  **Cargar contexto:** CLAUDE.md, la sección del GDD afectada, la fase en PLAN.md y STATUS.md.

2.  **Planificar (architect):** desglose en tareas de ≤ 1 día de trabajo de agente, con dueño, dependencias y criterio verificable. Se escribe en docs/progress/fase-XX/plan.md.

3.  **Delegar en paralelo:** lanzar subagentes sobre tareas independientes (típicamente 3–5 a la vez), cada uno en su rama fase-XX/\<tarea\> o worktree aislado. Instrucción estándar: "implementa, testea, mide, reporta".

4.  **Integrar:** merge a fase-XX, resolver conflictos, /verificar.

5.  **Revisar (reviewer):** revisión adversarial del diff y de capturas. Hallazgos "bloqueantes" vuelven al paso 3.

6.  **Verificar criterios:** cada criterio con evidencia (salida de test, número, captura). Si alguno falla, diagnosticar causa y volver al paso 3 con una tarea correctiva.

7.  **Documentar (devlog-reporter):** entrada de devlog (§5), STATUS.md, CHANGELOG.md.

8.  **Cerrar:** merge a main, deploy a Render staging (production en hitos), tag fase-XX, y pasar directamente a la fase siguiente.

### 4.1 Reglas del bucle

- **Tres intentos sin progreso** sobre el mismo problema → el orquestador cambia de enfoque (otro subagente, architect replantea, se reduce el alcance de la tarea y se registra un ADR). Nunca se abandona la fase.

- **Bloqueo externo** (puerta humana, servicio caído) → placeholder TODO-HUMANO, se continúa con lo independiente y se reporta.

- **Contexto largo:** al llegar a ~70% del contexto, el orquestador guarda estado en STATUS.md y continúa en sesión nueva con /estado + /fase n.

- **Prohibido** marcar tareas como hechas sin evidencia, desactivar tests para pasar CI o bajar criterios sin ADR justificado.

## 5. Devlog visual del progreso

Cada fase deja algo para mirar mientras el juego completo no está: capturas, un GIF o video corto, y una tarjeta de progreso. Todo se publica en una página **/devlog** del propio sitio en Render, visible desde el primer día.

### 5.1 Qué se genera en cada fase

| Elemento                | Detalle                                                                                          | Herramienta                   |
|-------------------------|--------------------------------------------------------------------------------------------------|-------------------------------|
| 3–6 capturas            | Escenas de referencia fijas de la fase (misma cámara y semilla, para comparar fases) a 1920×1080 | Playwright headless con WebGL |
| 1 GIF o WebM de 10–20 s | La funcionalidad estrella de la fase en movimiento                                               | Playwright video + ffmpeg     |
| Tarjeta de progreso     | Fase, % del plan total, qué se puede hacer ahora, métricas (FPS, unidades, tests)                | Generada desde STATUS.md      |
| Antes/después           | Comparación con la captura equivalente de la fase anterior                                       | Script de devlog              |
| Barra de hitos          | Línea de tiempo de los 5 hitos con la fase actual marcada                                        | Componente React de la página |

### 5.2 Dónde queda

- docs/progress/fase-XX/README.md con las imágenes embebidas (se ve directo en GitHub).

- Página /devlog en el sitio: una tarjeta por fase, la más reciente arriba, con galería y GIF.

- Release de GitHub por fase con las capturas adjuntas.

### 5.3 Escenas de referencia

tools/devlog/scenes/\*.json: (1) aldea en Era I a los 5 min, (2) batalla de 60 unidades, (3) vista de bioma con agua y bosque, (4) menú/HUD, (5) mapa completo en minimapa. Se reproducen con semilla fija y comandos grabados, así cada fase muestra exactamente la misma escena mejorando.

### 5.4 Formato de la entrada

\# Fase 03 — Economía y construcción (17% del plan)  
\![aldea\](aldea.png) \![gif\](construccion.webm)  
\*\*Ahora se puede:\*\* recolectar 4 recursos, construir 12 edificios, subir a Era del Hierro.  
\*\*Métricas:\*\* 62 fps con 150 colonos · tick 0,9 ms · 412 tests verdes.  
\*\*Siguiente:\*\* combate y unidades militares.

## 6. Hito 1 — Prototipo jugable (Fases 0 a 3)

Al cerrar el Hito 1 se entra a la URL de Render y se juega un sandbox: colonos que recolectan, construyen y suben a la Era del Hierro sobre un mapa isométrico generado, con niebla y minimapa. Arte provisional.

### Fase 0 — Fundaciones

**Objetivo:** repositorio, herramientas, CI, despliegue y configuración de agentes listos.

| Subagente        | Tareas                                                                                                                                                               |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| architect        | Exportar el GDD a docs/GDD.md; ADR-001 (stack), ADR-002 (lockstep + relay), ADR-003 (punto fijo); contratos entre paquetes                                           |
| backend-engineer | Monorepo pnpm + Turborepo + TS estricto + ESLint/Prettier; render.yaml con Static Site, API y relay "hola mundo"; GitHub Actions (lint, test, build, deploy staging) |
| content-designer | Esquemas Zod de packages/data y JSON iniciales transcritos del GDD (§4–§10) con validador pnpm data:check                                                            |
| qa-engineer      | Vitest + Playwright configurados; lint propio lint:sim que bloquea floats y APIs no deterministas                                                                    |
| devlog-reporter  | tools/devlog + página /devlog mínima publicada                                                                                                                       |

**Criterios:** pnpm build y CI verdes; la URL de Render muestra el placeholder y /devlog con la entrada de Fase 0; data:check valida todos los JSON; .claude/agents y CLAUDE.md creados.

**Devlog:** captura del pipeline en verde y de la página desplegada.

### Fase 1 — Núcleo de simulación determinista

**Objetivo:** la simulación corre headless, reproducible bit a bit, con unidades que se mueven por un mapa con obstáculos.

| Subagente         | Tareas                                                                                                                                              |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| sim-engineer      | Punto fijo (shared/fixed.ts) con tablas trigonométricas; PRNG xoshiro128\*\*; ECS SoA; loop de 20 ticks; sistema de comandos; hash FNV-1a por turno |
| sim-engineer (2º) | Rejilla de casillas, ocupación de edificios, A\* jerárquico por sectores 16×16, steering local y colisiones                                         |
| qa-engineer       | Runner headless (tools/headless) que reproduce repeticiones; test de determinismo Node vs Chrome vs Firefox vs WebKit; bench de 1000 unidades       |
| architect         | Revisión del diseño del ECS y del formato de comandos antes del merge                                                                               |

**Criterios:** 1000 unidades moviéndose por 10 000 ticks producen el mismo hash en los 4 entornos; tick ≤ 3 ms con 400 unidades; 0 violaciones de lint:sim.

**Devlog:** visualización debug en canvas 2D (puntos y rutas) en GIF + tabla de benchmark.

### Fase 2 — Render isométrico base

**Objetivo:** ver y controlar la simulación en el navegador con PixiJS.

| Subagente            | Tareas                                                                                                                                                                        |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| render-engineer      | PixiJS v8, proyección 2:1, chunks de terreno con splatting básico, cámara (bordes, flechas, zoom 3 niveles), orden de profundidad, culling, interpolación de estados a 60 fps |
| render-engineer (2º) | Niebla de guerra (rejilla de visibilidad con referencias, textura desenfocada), minimapa                                                                                      |
| sim-engineer         | Simulación dentro de un Web Worker con mensajes de comandos y snapshots compactos (SharedArrayBuffer si COOP/COEP disponible)                                                 |
| ui-engineer          | Selección con caja, clic derecho para mover, grupos de control, marcador de orden; capa React mínima                                                                          |
| art-pipeline         | Sprites provisionales (CC0 de Kenney/Quaternius renderizados a 8 direcciones) y texturas de terreno provisionales                                                             |

**Criterios:** 400 unidades a ≥ 60 fps en el hardware de referencia; selección y movimiento sin lag perceptible; niebla correcta; sin bordes de tile visibles.

**Devlog:** primeras capturas del mapa isométrico; GIF de selección y movimiento de 100 unidades.

### Fase 3 — Economía y construcción (Eras I–II)

**Objetivo:** el bucle económico completo de las dos primeras eras.

| Subagente         | Tareas                                                                                                                                                                                                                                                                       |
|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| sim-engineer      | Colonos: recolección con caminata real, carga, depósitos, caza y putrefacción, ovejas, bayas, granjas con búfer, talado de bosques; construcción con fórmula 3t/(n+2) y reparación; población; colas de producción; eras I–II con requisitos; tecnologías como modificadores |
| content-designer  | Script de mapa "Llanuras de Ceniza" y generador por etapas (§11 del GDD) con validación de equidad                                                                                                                                                                           |
| sim-engineer (2º) | Generador procedural determinista (ruido con semilla, clumps de bosque, colocación de recursos por distancias)                                                                                                                                                               |
| ui-engineer       | HUD: barra de recursos, panel de selección, cuadrícula de comandos con atajos, colocación de edificios con previsualización válida/inválida, colono ocioso, colas, punto de reunión                                                                                          |
| qa-engineer       | Bot de build order de scouts (Era II alrededor de 7:55–8:30 con 21 de población, ±15 s) como test de CI                                                                                                                                                                      |

**Criterios:** test de calibración verde; se puede jugar 15 minutos de economía sin errores; 150 colonos a ≥ 60 fps.

**Devlog y puerta humana (revisión de hito):** video de 20 s de una aldea creciendo de 3 a 30 colonos; tarjeta "Hito 1 completo".

## 7. Hito 2 — MVP contra la IA (Fases 4 y 5)

Al cerrar el Hito 2 se puede jugar una partida completa 1v1 contra la IA, de Era I a Era II, con ejército, counters y victoria por conquista. Es el primer momento "juego de verdad".

### Fase 4 — Combate y unidades militares

| Subagente         | Tareas                                                                                                                                                                                                        |
|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| sim-engineer      | Fórmula de daño con clases de armadura en punto fijo; proyectiles con precisión y desvío; RoF; actitudes; atacar-mover, patrullar, seguir; guarnición y flechas extra; campana de la aldea; muerte, cadáveres |
| sim-engineer (2º) | Flow fields por sector para grupos grandes, formaciones (línea, caja, escalonada, flanco), movimiento a velocidad del más lento                                                                               |
| content-designer  | Unidades y tecnologías de Eras I–II (Recluta, Guerrero, Lancero, Arquero, Escaramuzador, Batidor), Forja, Cuartel, Arquería, Establo, torres y empalizadas                                                    |
| render-engineer   | Animaciones de ataque y muerte, proyectiles en arco, barras de PV, efectos de impacto básicos, indicador de ataque en minimapa                                                                                |
| qa-engineer       | Tests de fórmulas contra casos del GDD (Alabardero vs Paladín = 37), duelos 1v1 por pares con resultados esperados, test de desync de formaciones                                                             |

**Criterios:** tabla de counters del GDD §8.7 verificada en duelos headless (gana el counter esperado ≥ 80% de las veces en igualdad de recursos); batalla de 200 vs 200 a ≥ 50 fps; formaciones sin desync en 4 entornos.

**Devlog:** GIF de una batalla de 60 unidades con arqueros detrás de lanceros.

### Fase 5 — IA, mapas y partida rápida

| Subagente        | Tareas                                                                                                                                                                             |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ai-designer      | Motor de reglas (condiciones → acciones), capas estratégica/económica/producción/táctica, build orders de scouts y arqueros, 6 dificultades, atracción de jabalí, defensa de aldea |
| qa-engineer      | Torneo headless IA vs IA (100 partidas por dificultad) para detectar atascos; métrica de tiempo de Era II por dificultad                                                           |
| ui-engineer      | Pantalla de configuración de partida rápida/escaramuza; pantalla de fin de partida con estadísticas y gráfico de población                                                         |
| sim-engineer     | Condiciones de victoria (conquista, rendirse), diplomacia básica, pausa en single player                                                                                           |
| content-designer | 2 mapas más: Ciudad Amurallada y Bosque Negro                                                                                                                                      |

**Criterios:** la IA Difícil gana ≥ 90% contra la Normal; ninguna IA se atasca (sin colonos ociosos \> 60 s) en 300 partidas; partida rápida en un clic desde la web desplegada.

**Devlog y puerta humana:** video de 30 s de una partida contra la IA Difícil; enlace jugable en production. Tarjeta "Hito 2: MVP jugable".

## 8. Hito 3 — Aspecto AAA y contenido completo (Fases 6 y 7)

Al cerrar el Hito 3 el juego luce como un RTS comercial (≥ 8/10 visual) y tiene las 4 eras, las 4 facciones y todos los sistemas de juego del GDD. La adquisición de assets (puerta humana) puede adelantarse en paralelo desde la Fase 2.

### Fase 6 — Pipeline de arte, iluminación y audio

| Subagente         | Tareas                                                                                                                                                                                                                                                                               |
|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| art-pipeline      | Script render_sprites.py para Blender headless (cámara ortográfica 2:1, 16 direcciones, color + normal + máscara de jugador + sombra); empaquetado de atlas KTX2/WebP; validador de assets; ASSETS_LICENSES.md                                                                       |
| art-pipeline (2º) | Integrar packs aprobados: retexturizado con paleta propia, variantes de era y facción; 4 biomas de terreno con texturas tileables y LUTs                                                                                                                                             |
| render-engineer   | Iluminación 2D por normal maps (sol de hora dorada + luces de fuego y éter), shader de agua con espuma y reflejo, viento en árboles, partículas (polvo, chispas, humo, fuego, éter, escombros), post-proceso (bloom, grading, viñeta), sombras de nubes en Ultra, niveles de calidad |
| ui-engineer       | Diseño de UI definitivo: marcos, iconos pintados, tipografía, cursor propio, animaciones de botones                                                                                                                                                                                  |
| audio-engineer    | Sistema de audio con buses, atenuación por cámara, límites de voces, música adaptativa calma/combate, alertas; integrar efectos y voces aprobados                                                                                                                                    |
| reviewer          | Puntaje visual 1–10 (legibilidad, cohesión, riqueza, "wow") contra capturas de RTS comerciales de referencia                                                                                                                                                                         |

**Criterios:** puntaje visual ≥ 8 en los 4 ejes; FPS dentro de presupuesto en Alta; descarga hasta el menú ≤ 8 MB; sin assets sin licencia registrada.

**Devlog:** antes/después de las 5 escenas de referencia (es la entrega más vistosa del plan) y video de 30 s con sonido.

### Fase 7 — Contenido completo de juego

| Subagente        | Tareas                                                                                                                                                                                                                                                                          |
|------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| content-designer | Eras III–IV; todas las unidades, mejoras y tecnologías del GDD §7–§9; 4 facciones con bonus, únicos y árboles; Faro Celeste; Fragmentos                                                                                                                                         |
| sim-engineer     | Custodios (curación, Resonancia probabilística, Fragmentos), asedio con daño de área y despliegue del Fundíbulo, murallas por arrastre y portones, elevación con ±25%, mercado con precios dinámicos y comercio con fórmula, tributo, naval básico (pesca, galeras, transporte) |
| ai-designer      | IA para Eras III–IV: fast castle, Custodios, asedio, murallas; IA por facción                                                                                                                                                                                                   |
| art-pipeline     | Sprites de todas las unidades y edificios nuevos por facción                                                                                                                                                                                                                    |
| qa-engineer      | Test de fast castle (Era III alrededor de 16:00–16:30); torneo de balance 1000 partidas por par de facciones (47–53%); tests de cada modo de victoria                                                                                                                           |

**Criterios:** todos los elementos del GDD §4–§11 implementados o con ADR que los posponga; balance dentro de rango; 4v4 con 1200 unidades ≥ 45 fps en Media.

**Devlog y puerta humana:** galería de las 4 facciones (arquitectura y ejércitos) y GIF de un asedio con Fundíbulos contra un Bastión.

## 9. Hito 4 — Online (Fases 8 y 9)

Al cerrar el Hito 4 dos personas en distintas ciudades entran a la web, se emparejan en ranked y juegan una partida completa sin desync, con repetición guardada.

### Fase 8 — Backend, cuentas y persistencia

| Subagente             | Tareas                                                                                                                                                                                                                     |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| backend-engineer      | API Express 5 con modelos Mongoose del GDD §18.2; auth JWT en cookie httpOnly + refresh; modo invitado convertible en cuenta; OAuth Google/Discord (puerta humana); rate limiting con Redis; validación con Zod compartida |
| backend-engineer (2º) | Servicios en render.yaml (API, relay, Key Value, variables), conexión a MongoDB Atlas, entornos staging/production, backups                                                                                                |
| ui-engineer           | Registro, login, perfil, opciones sincronizadas, historial de partidas                                                                                                                                                     |
| qa-engineer           | Tests de API (supertest), E2E de registro y login, pruebas de seguridad básicas (OWASP: inyección, XSS, CSRF, fuerza bruta)                                                                                                |

**Criterios:** registro, login e invitado funcionan en production; datos de perfil persisten; cero secretos en el repo; tests de seguridad verdes.

**Devlog:** capturas de las pantallas de cuenta y perfil.

### Fase 9 — Multijugador lockstep, lobbies y ranked

| Subagente             | Tareas                                                                                                                                                                                                                                 |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| netcode-engineer      | Relay WebSocket: turnos de 200 ms con ejecución en n+2, turno adaptativo 100–400 ms, "esperando a jugador", comparación de hashes y reporte de desync con dump, reconexión por re-simulación rápida o snapshot, validación de comandos |
| netcode-engineer (2º) | Lobbies con chat y configuración, invitación por enlace, espectadores con retraso de 2 min, matchmaking por rating en Redis con veto de mapas, IA de relleno                                                                           |
| backend-engineer      | Glicko-2, ligas, temporadas, tablas de clasificación, guardado de repeticiones comprimidas en GridFS                                                                                                                                   |
| ui-engineer           | Pantallas de multijugador, cola, sala, carga con progreso por jugador, reproductor de repeticiones (velocidades, cámara libre, vista por jugador)                                                                                      |
| qa-engineer           | E2E con 2 y 8 clientes Playwright en navegadores distintos; latencia simulada (80, 200 ms, pérdida 2%); prueba de carga de 200 partidas simultáneas                                                                                    |

**Criterios:** 50 partidas completas de 2 y 8 clientes en navegadores mezclados sin desync; reconexión exitosa en \< 20 s; latencia percibida ≤ 300 ms con ping 80 ms; relay estable con 200 partidas.

**Devlog:** video lado a lado de dos navegadores jugando la misma partida; tarjeta "Hito 4: online".

## 10. Hito 5 — Lanzamiento 1.0 (Fases 10 a 13)

Al cerrar el Hito 5 el juego se siente como un producto de PC completo: arranque con cinemática, menú vivo, campaña, progresión diaria y rendimiento pulido.

### Fase 10 — Experiencia "juego de PC" en el navegador

| Subagente       | Tareas                                                                                                                                                                                                                                                                            |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ui-engineer     | Pantalla de precarga con logo animado, "click para comenzar" (audio + pantalla completa), menú principal sobre escena viva, transiciones con Framer Motion, pantallas de carga con ilustración y consejos, opciones completas (gráficos, audio, controles, accesibilidad, idioma) |
| render-engineer | Sistema de cámaras scriptadas y escenas para la **cinemática de introducción** (60–90 s) hecha en motor: Corona Celeste quebrándose, lluvia de éter, ejércitos; subtítulos y narración                                                                                            |
| audio-engineer  | Tema principal, mezcla de la cinemática, sonidos de UI                                                                                                                                                                                                                            |
| qa-engineer     | Medición de tiempo hasta el menú (≤ 6 s) y Service Worker de caché de assets                                                                                                                                                                                                      |

**Criterios:** precarga a menú ≤ 6 s en 50 Mbps; cinemática saltable y revisable; puntaje visual de menús ≥ 8. **Devlog:** la cinemática completa en video.

### Fase 11 — Campaña y tutorial

| Subagente                     | Tareas                                                                                                                           |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| sim-engineer                  | Motor de escenarios: triggers condición → efecto, variables, objetivos, héroes, IA por escenario                                 |
| content-designer              | Prólogo "Las Cenizas" (3 misiones tutoriales) y Campaña "La Espada de Valdren" (6 misiones), diálogos, briefings, medallas       |
| render-engineer + ui-engineer | Briefing con mapa ilustrado y narración, escenas en motor entre misiones, retratos en diálogos, pantalla de selección de campaña |
| ui-engineer                   | Editor de escenarios interno (para el equipo; público en 1.1)                                                                    |
| qa-engineer                   | Bot que completa cada misión con un guion de comandos (detecta misiones imposibles)                                              |

**Criterios:** las 9 misiones completables en las 3 dificultades por el bot; abandono simulado del tutorial \< 30% en test con 5 jugadores reales (puerta humana opcional). **Devlog:** briefing y primera misión en video.

### Fase 12 — Retención y social

| Subagente        | Tareas                                                                                                                                                                                                                   |
|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| backend-engineer | Desafío diario (semilla del día, validación del resultado re-simulando la repetición en el servidor), misiones semanales, XP y niveles, maestría por facción, logros, amigos y presencia, telemetría anónima con opt-out |
| ui-engineer      | Pantallas de desafío diario y tabla, misiones, perfil con estandartes y logros, notificaciones de recompensa al terminar partida, modo Guerra de Coronas en el menú                                                      |
| content-designer | 60 logros, misiones semanales rotativas, cosméticos (estandartes, marcos, frases)                                                                                                                                        |
| qa-engineer      | Tests de anti-trampa del desafío diario, E2E del ciclo de recompensas                                                                                                                                                    |

**Criterios:** ciclo diario completo funcionando en production; ninguna recompensa obtenible sin jugar; telemetría de D1/D7 visible en un panel interno. **Devlog:** captura del perfil con progresión y GIF de recompensa.

### Fase 13 — Pulido, balance, beta y lanzamiento

| Subagente                      | Tareas                                                                                                                                               |
|--------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| qa-engineer                    | Barrido de rendimiento contra todos los presupuestos (GDD §17.1), regresión visual, compatibilidad Chrome/Edge/Firefox/Safari, prueba de carga final |
| ai-designer + content-designer | Torneos de balance finales, ajuste de dificultades de IA con datos de beta                                                                           |
| ui-engineer                    | Accesibilidad (daltonismo, escala de UI), traducción al inglés, pantalla de aviso para móviles                                                       |
| backend-engineer               | Monitoreo, alertas, backups verificados, plan de escalado del relay                                                                                  |
| reviewer                       | Auditoría final: legal de assets, seguridad, deuda técnica crítica, puntaje visual global                                                            |
| devlog-reporter                | Tráiler de 60 s capturado del juego y página de lanzamiento                                                                                          |

**Criterios:** todos los presupuestos cumplidos; 0 bugs bloqueantes; beta cerrada de 2 semanas con D1 ≥ 35%; revisión legal (puerta humana); ranked abierto. **Devlog:** tráiler y tarjeta "1.0".

## 11. Prompts listos para pegar en Claude Code

### 11.1 Arranque (primera sesión, repo vacío)

Sos el orquestador del proyecto "Reinos de Ceniza", un RTS web estilo Age of Empires II  
de calidad AAA desplegado en Render. Te adjunto dos documentos: el Documento Técnico  
(GDD + TDD) y el Plan de desarrollo. Guardalos como docs/GDD.md y docs/PLAN.md.  
  
Ejecutá la Fase 0 del plan completa: creá CLAUDE.md, los subagentes de .claude/agents  
(sección 2.3), los comandos de .claude/commands, el monorepo, CI y render.yaml.  
Seguí el protocolo de la sección 4: delega en subagentes, verifica cada criterio con  
evidencia, hacé revisar por \`reviewer\` y generá el devlog de la fase.  
  
Cuando la Fase 0 cumpla su definición de terminado, continuá con la Fase 1 sin  
preguntarme. Solo pará en una puerta humana; si una puerta no está resuelta, usá  
placeholders TODO-HUMANO, seguí con lo independiente y dejá todo en STATUS.md.

### 11.2 Retomar en una sesión nueva

/estado  
Leé CLAUDE.md, docs/progress/STATUS.md y la fase actual de docs/PLAN.md.  
Continuá desde la última tarea pendiente siguiendo el protocolo de la sección 4.  
No cierres la fase hasta que todos los criterios estén verdes con evidencia.

### 11.3 Plantilla de delegación a un subagente

Subagente: \<nombre\>  
Tarea: \<qué construir\>, según GDD §\<sección\>.  
Entradas: \<archivos, contratos, datos\>.  
Salida esperada: \<diff, tests, métricas, capturas\>.  
Criterios de aceptación: \<lista verificable\>.  
Restricciones: reglas de CLAUDE.md; no tocar \<paquetes fuera de alcance\>.  
Al terminar: reportá qué hiciste, evidencia de cada criterio y riesgos abiertos.

### 11.4 Revisión adversarial

Subagente: reviewer  
Revisá el diff de la rama fase-XX y las capturas en docs/progress/fase-XX/.  
Buscá: no determinismo en sim, valores de balance fuera de packages/data, tests que  
no prueban nada, problemas de rendimiento, assets sin licencia, UI ilegible.  
Puntuá lo visual 1-10 en legibilidad, cohesión, riqueza y "wow" frente a un RTS  
comercial. Clasificá cada hallazgo como bloqueante o menor, con archivo y línea.

### 11.5 Devlog de fase

/devlog  
Subagente: devlog-reporter. Reproducí las escenas de tools/devlog/scenes con la  
build actual, capturá imágenes 1920x1080 y un WebM de 15 s de la funcionalidad  
estrella, generá docs/progress/fase-XX/README.md con antes/después y métricas,  
actualizá la página /devlog y creá el release de GitHub fase-XX con las capturas.
