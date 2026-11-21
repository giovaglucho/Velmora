// I1 — entry point (index.html). Boots the demo game, installs window.__reinos (debug) and keeps the
// title / devlog link of index.html. Owner: render-engineer.
import { installDebugApi, type ReinosDebugApi } from './debug';
import { startGame, type GameRuntime } from './game';
import { readBootParams, type BootParams } from './isolation';
import { isScenarioName } from '../worker/scenarios';
import { ZOOMS } from '../render/constants';

const root = document.getElementById('app');
if (root === null) throw new Error('#app not found');

const params = readBootParams(
  location.search,
  import.meta.env.DEV,
  (import.meta.env as Record<string, unknown>).VITE_ENABLE_DEBUG === '1',
);
let current: GameRuntime | null = null;
let api: ReinosDebugApi | null = null;

const status = (text: string, error = false): void => {
  const p = document.createElement('p');
  p.className = error ? 'boot-error' : 'boot-status';
  p.textContent = text;
  root.replaceChildren(p);
};

async function boot(p: BootParams): Promise<void> {
  status('Cargando Reinos de Ceniza…');
  try {
    current = await startGame(p, root as HTMLElement);
    if (api) {
      api.error = null;
      api.scenario = p.scenario;
      api.assets = current.assets;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[boot]', e);
    status(`No se pudo iniciar la partida: ${msg}`, true);
    if (api) api.error = msg;
    throw e;
  }
}

if (params.debug) {
  const g = (): GameRuntime => {
    if (current === null) throw new Error('game not ready');
    return current;
  };
  const debug: ReinosDebugApi = {
    ready: false,
    error: null,
    scenario: params.scenario,
    assets: 'procedural',
    get tick() {
      return current?.view()?.tick ?? 0;
    },
    get lastTurnHash() {
      return current?.lastTurnHash ?? null;
    },
    get metrics() {
      return g().metrics();
    },
    get stats() {
      return { ...g().renderer.stats };
    },
    get reactRendersPerSec() {
      return g().metrics().reactRendersPerSec;
    },
    get camera() {
      const c = g().renderer.camera;
      return { x: c.x, y: c.y, zoomIndex: c.zoomIndex, zoomT: c.zoomT };
    },
    set camera(v) {
      const c = g().renderer.camera;
      c.x = v.x;
      c.y = v.y;
      c.zoomIndex = v.zoomIndex;
      c.zoomT = ZOOMS[v.zoomIndex];
      c.anchor = null;
    },
    select: (eids) => g().input.selection.set(eids),
    selection: () => [...g().input.selection.eids],
    units: () => g().units(),
    fogState: (tx, ty) => g().fog.fogState(tx, ty) as 0 | 1 | 2,
    screenOfTile(tx, ty) {
      const r = g().renderer;
      const c = r.camera;
      const wx = (tx + 0.5 - (ty + 0.5)) * 64;
      const wy = (tx + 0.5 + ty + 0.5) * 32;
      return {
        sx: (wx - c.x) * c.zoomT + r.viewport.vw / 2,
        sy: (wy - c.y) * c.zoomT + r.viewport.vh / 2,
      };
    },
    control: (op) => g().client.control(op),
    perfReport: () => g().perfReport(),
    async loadScenario(name) {
      if (!isScenarioName(name)) throw new Error(`unknown scenario: ${name}`);
      debug.ready = false;
      current?.dispose();
      current = null;
      await boot({ ...params, scenario: name });
      debug.ready = true;
    },
  };
  api = debug;
  installDebugApi(debug);
}

void boot(params).then(
  () => {
    if (api) api.ready = true;
  },
  () => undefined,
);
