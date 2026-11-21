# ADR-001: Stack tecnologico

## Contexto

Reinos de Velmora es un RTS 2.5D de navegador con simulacion determinista, multijugador lockstep y backend ligero (GDD 15.1). Se necesita un solo lenguaje con tipos compartidos entre simulacion, cliente y servidor, builds incrementales en un monorepo, render 2D de alto rendimiento (miles de sprites a 60 fps) y un backend que cubra REST, WebSocket y persistencia.

## Decision

- **Lenguaje:** TypeScript estricto en todo el monorepo (`tsconfig.base.json`).
- **Monorepo:** pnpm workspaces + Turborepo. Paquetes `@reinos/sim`, `data`, `client`, `server`, `shared`; herramientas en `tools/*`.
- **Simulacion:** TypeScript puro sin dependencias de runtime externas, ejecutada en un Web Worker (ver ADR-003).
- **Render:** PixiJS v8 (WebGL2, WebGPU cuando este disponible) con shaders GLSL propios.
- **UI:** React 19 + Vite, capa DOM para menus y HUD. El GDD prev. ademas Zustand, Tailwind y Framer Motion; se incorporan cuando la fase correspondiente los necesite.
- **Backend:** Node 22 + Express 5 + `ws` (WebSocket nativo). uWebSockets.js solo si las mediciones lo exigen.
- **Base de datos:** MongoDB Atlas (Mongoose) para cuentas, partidas, repeticiones y rating.
- **Despliegue:** Render (Static Site para el cliente, Web Services para API y relay, Key Value para colas/presencia); ver ADR-004.
- **Tests:** Vitest, Playwright y tests headless de simulacion.

## Alternativas consideradas

- **Rust/WASM para la simulacion:** mejor rendimiento bruto, pero duplica toolchain y complica el determinismo entre motores JS y WASM; TS con enteros alcanza los presupuestos del GDD (400 unidades <= 3 ms/tick).
- **Phaser / Three.js / Canvas 2D:** Phaser acopla escena y logica; Three.js es excesivo para 2.5D prerenderizado; Canvas 2D no escala a miles de sprites con filtros.
- **npm/yarn workspaces o Nx:** pnpm + Turborepo da instalacion estricta y cache incremental con menos configuracion.
- **uWebSockets.js desde el inicio:** mas rendimiento, pero binario nativo y peor portabilidad en Render; `ws` basta, ya que el relay solo reenvia comandos.
- **PostgreSQL / base gestionada en Render:** Render no ofrece Mongo gestionado, de ahi Atlas externo; el modelo documental encaja con repeticiones y perfiles.

## Consecuencias

- Tipos y esquemas (zod en `@reinos/data`) compartidos de extremo a extremo.
- Un solo toolchain y un solo lenguaje reducen el costo de contexto para agentes y humanos.
- La sim en TS exige disciplina de determinismo (lint:sim, ADR-003).
- Dependencia de un servicio externo (Atlas) y de los planes de pago de Render para el relay.
- Cambiar de motor de render o de DB exige un nuevo ADR.

## Estado

Aceptado.
