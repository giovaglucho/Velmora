// I1 — wires one running game: Worker sim client, Pixi renderer, fog, minimap, input and the React HUD.
// Owner: render-engineer. Everything is created in `startGame` and torn down by `dispose` (so the debug API's
// `loadScenario` can boot another scenario in place). The per-frame order is fixed by the Renderer hooks:
//   beforeFrame  → input.step (camera pan / edge scroll / zoom easing)
//   onFrame      → fog update + fog texture fade + minimap redraw (10 Hz) + alpha for picking
//   units.update → enemy sprites hidden by FogSystem.isSlotVisible
//   afterRender  → input→marker latency probe, perf samples
import { buildSimData, loadGameData } from '@reinos/data';
import { loadProvisionalAssets, meanRgbaBytes, type LoadedAssets } from '../assets/loader';
import { createRenderer, type Renderer } from '../render/renderer';
import { centerOnGrid } from '../render/camera';
import { screenToGrid, worldToScreen, gridToWorld, interpolatedPos } from '../render/iso';
import { createProceduralUnitAtlas } from '../render/entities/atlas';
import { FogRenderer } from '../render/fog/fogRenderer';
import { FogSystem } from '../render/fog/fogSystem';
import { FOG_VISIBLE } from '../render/fog/visionGrid';
import { Minimap } from '../render/minimap/minimap';
import {
  PROC_GROUND_SIZE,
  generateForest,
  generateGround,
  generateWater,
} from '../render/terrain/procGen';
import { buildTerrainMap } from '../render/terrain/terrainMap';
import { createProceduralTerrainTextures } from '../render/terrain/textures';
import type { Camera, Viewport } from '../render/types';
import { createBoxOverlay } from '../input/boxOverlay';
import { readInputConfig } from '../input/config';
import { createInputController, type InputController } from '../input/controller';
import { renderGeometry } from '../input/geometry';
import { startBridge } from '../ui/bridge';
import type { HudIntents } from '../ui/intents';
import { reactRendersPerSec } from '../ui/metrics';
import { mountHud } from '../ui/mount';
import { createSimClient, type SimClient } from '../worker/client';
import type { ReadyInfo } from '../worker/protocol';
import { buildScenario, buildScenarioObstacles } from '../worker/scenarios';
import { FLAG_ALIVE, type SnapshotView } from '../worker/snapshot';
import type { PerfReport, ReinosMetrics, ReinosUnit } from './debug';
import type { BootParams } from './isolation';

/** The human player of the F2 demo (the other one is the opponent: fog hides it). */
const LOCAL_PLAYER = 0;
/** Perf samples kept for `perfReport()` (≈ 1 minute at 60 fps). */
const PERF_SAMPLES = 3600;

export interface GameRuntime {
  readonly params: BootParams;
  readonly ready: ReadyInfo;
  readonly assets: 'provisional' | 'procedural';
  readonly client: SimClient;
  readonly renderer: Renderer;
  readonly input: InputController;
  readonly fog: FogSystem;
  readonly fogRenderer: FogRenderer;
  /** Live metrics (fresh object per call). */
  metrics(): ReinosMetrics;
  readonly mapW: number;
  readonly mapH: number;
  lastTurnHash: number | null;
  view(): SnapshotView | null;
  units(): ReinosUnit[];
  perfReport(): PerfReport;
  dispose(): void;
}

function meanProceduralRgb(layer: number): number {
  const d =
    layer === 4
      ? generateWater(PROC_GROUND_SIZE)
      : layer === 5
        ? generateForest(PROC_GROUND_SIZE)
        : generateGround(layer, PROC_GROUND_SIZE);
  return meanRgbaBytes(d);
}

function percentile(sorted: Float32Array, n: number, p: number): number {
  if (n === 0) return 0;
  return sorted[Math.min(n - 1, Math.floor((p / 100) * n))] ?? 0;
}

export async function startGame(params: BootParams, root: HTMLElement): Promise<GameRuntime> {
  const data = loadGameData();
  const simData = buildSimData(data);
  const unitSprites = data.units.map((u) => u.sprite);
  const unitIds = data.units.map((u) => u.id);
  const losTiles = data.units.map((u) => u.los);
  const config = buildScenario(params.scenario, params.seed);
  const mapW = config.map.width;
  const mapH = config.map.height;

  // --- DOM: stage = canvas + React HUD layer + rubber-band layer ---
  const stage = document.createElement('div');
  stage.className = 'stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  const hudHost = document.createElement('div');
  hudHost.className = 'hud-host';
  const boxHost = document.createElement('div');
  boxHost.className = 'box-host';
  stage.append(canvas, hudHost, boxHost);
  root.replaceChildren(stage);

  // --- Worker sim (snapshot 0 is published before `ready`) ---
  const client = createSimClient();
  const ready = await client.start({
    seed: params.seed,
    config,
    ...(params.snap === 'auto' ? {} : { mode: params.snap }),
  });

  // --- Art: generated provisional set, in-memory procedural fallback if it cannot be loaded ---
  let loaded: LoadedAssets | null = null;
  try {
    loaded = await loadProvisionalAssets({ unitSprites });
  } catch (e) {
    console.warn('[assets] provisional set unavailable, using in-memory procedural art:', e);
  }
  // Lake/forest classes of the blocked tiles are client-side presentation data (the sim only knows "blocked").
  const terrain = buildTerrainMap(
    mapW,
    mapH,
    config.map.blockedRle ?? [],
    params.seed,
    buildScenarioObstacles(params.scenario, params.seed),
  );
  const layerRgb = loaded?.layerRgb ?? [0, 1, 2, 3, 4, 5].map(meanProceduralRgb);
  const terrainTextures = loaded?.terrain ?? createProceduralTerrainTextures();
  const unitAtlas = loaded?.unitAtlas ?? createProceduralUnitAtlas();

  // --- fog (client-side module, ADR-006 §7.1) ---
  const fog = new FogSystem({
    width: mapW,
    height: mapH,
    maxPlayers: config.maxPlayers,
    capacity: ready.capacity,
    losTilesByType: losTiles,
  });
  fog.setLocalPlayer(LOCAL_PLAYER);
  const fogRenderer = new FogRenderer(mapW, mapH);

  // The view of the frame: SimClient.latest() invalidates the previous view, so ONLY the renderer's frame
  // calls it; every other consumer (input, fog, minimap, HUD bridge, debug API) reads this cached copy.
  let current: SnapshotView | null = null;
  const feed = {
    latest(): SnapshotView | null {
      current = client.latest();
      return current;
    },
    get latestArrivalMs(): number {
      return client.latestArrivalMs;
    },
  };
  current = client.latest(); // tick-0 snapshot: used to frame the camera before the first frame

  // --- metrics / perf samples ---
  let inputToMarkerMs = 0;
  const frameDt = new Float32Array(PERF_SAMPLES);
  const frameUpdate = new Float32Array(PERF_SAMPLES);
  let samples = 0;
  let sampleHead = 0;
  let lastAlpha = 0;
  let pointerTs: number | null = null;
  let markerPendingTs: number | null = null;
  let lastDt = 0;
  let minimap: Minimap | null = null;
  let input: InputController | null = null;

  const cornersGrid = (cam: Camera, vp: Viewport) => [
    screenToGrid(cam, vp, 0, 0),
    screenToGrid(cam, vp, vp.vw, 0),
    screenToGrid(cam, vp, vp.vw, vp.vh),
    screenToGrid(cam, vp, 0, vp.vh),
  ];

  const renderer = await createRenderer({
    canvas,
    simClient: feed,
    terrain,
    zoomTauMs: data.game.camera.zoomTauMs,
    unitRadiusFx: simData.radiusFx,
    terrainTextures,
    unitAtlas,
    beforeFrame: (dtMs) => {
      lastDt = dtMs;
      input?.step(dtMs);
    },
    onFrame: ({ view, alpha, dtMs, nowMs }) => {
      lastAlpha = alpha;
      if (view) {
        const changed = fog.update(view);
        fogRenderer.sync(fog, changed, dtMs / 1000);
      }
      minimap?.update(nowMs, () => ({
        view,
        fog: fog.states,
        localPlayer: LOCAL_PLAYER,
        visionMask: fog.visionMask,
        cameraGrid: cornersGrid(renderer.camera, renderer.viewport),
      }));
    },
    slotVisible: (view, slot) => fog.isSlotVisible(view, slot),
    afterRender: (nowMs) => {
      if (markerPendingTs !== null) {
        inputToMarkerMs = nowMs - markerPendingTs;
        markerPendingTs = null;
      }
      const s = renderer.stats;
      frameDt[sampleHead] = lastDt;
      frameUpdate[sampleHead] = s.updateMs;
      sampleHead = (sampleHead + 1) % PERF_SAMPLES;
      samples = Math.min(samples + 1, PERF_SAMPLES);
    },
  });
  renderer.layers.fog.addChild(fogRenderer.view);
  renderer.setLocalPlayer(LOCAL_PLAYER);
  renderer.resize(window.innerWidth, window.innerHeight);

  // Frame the local army (centroid of own units of the tick-0 snapshot), else the map centre.
  {
    let sx = 0;
    let sy = 0;
    let n = 0;
    if (current) {
      for (let s = 0; s < current.highWater; s++) {
        if (((current.flags[s] ?? 0) & FLAG_ALIVE) === 0 || current.owner[s] !== LOCAL_PLAYER)
          continue;
        sx += current.posX[s] ?? 0;
        sy += current.posY[s] ?? 0;
        n++;
      }
    }
    if (n > 0) centerOnGrid(renderer.camera, sx / n / 1000, sy / n / 1000);
  }

  // --- input ---
  const box = createBoxOverlay(boxHost);
  const radiusFxOfType = (t: number): number => simData.radiusFx[t] ?? 0;
  const ctl = createInputController({
    config: readInputConfig(data.game),
    geo: renderGeometry,
    camera: renderer.camera,
    getViewport: () => renderer.viewport,
    getView: () => current,
    getAlpha: () => lastAlpha,
    localPlayer: () => LOCAL_PLAYER,
    now: () => performance.now(),
    send: (cmds) => client.send(cmds),
    marker: {
      showOrderMarker: (fxX, fxY) => {
        // The marker is shown by the next frame: the probe measures pointerdown → end of that render().
        const t = performance.now();
        markerPendingTs = pointerTs !== null && t - pointerTs < 100 ? pointerTs : t;
        renderer.spawnMarker(fxX / 1000, fxY / 1000);
      },
    },
    isTileVisible: (tx, ty) => fog.fogState(tx, ty) === FOG_VISIBLE,
    isAlly: (owner) => owner < 32 && ((fog.visionMask >>> owner) & 1) !== 0,
    radiusFxOfType,
    onBox: (r) => box.set(r),
  });
  input = ctl;
  const onPointerDownCapture = (e: PointerEvent): void => {
    pointerTs = e.timeStamp;
  };
  canvas.addEventListener('pointerdown', onPointerDownCapture, true);
  const detachInput = ctl.attach(canvas, window);
  const unsubSelection = ctl.selection.subscribe((eids) => renderer.setSelected(eids));
  const onResize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', onResize);

  // --- minimap (its DOM host is rendered by the React HUD) ---
  const mountMinimap = (host: HTMLDivElement | null): void => {
    minimap?.dispose();
    minimap = null;
    if (host === null) return;
    const mc = document.createElement('canvas');
    mc.className = 'minimap-canvas';
    mc.style.cssText = 'display:block;width:100%;height:100%;border-radius:4px';
    host.replaceChildren(mc);
    const mm = new Minimap({
      canvas: mc,
      mapW,
      mapH,
      terrainRgb: (tile) => layerRgb[terrain.kind[tile] ?? 0] ?? 0x606060,
    });
    mm.attachInput({
      onNavigate: (gx, gy) => centerOnGrid(renderer.camera, gx, gy),
      onOrder: (gx, gy) => ctl.orders.moveToGrid(gx, gy),
    });
    minimap = mm;
  };

  // --- HUD (React, 10 Hz store) ---
  const intents: HudIntents = {
    selectGroup(n) {
      const v = current;
      if (!v) return;
      const r = ctl.groups.recall(n, v, performance.now());
      ctl.selection.set(r.eids);
      if (r.center && r.centroidFx) ctl.cameraController.centerOnFx(r.centroidFx.x, r.centroidFx.y);
    },
  };
  const bridge = startBridge({
    getView: () => current,
    selection: ctl.selection,
    groups: ctl.groups,
    getCamera: () => renderer.camera,
    getStats: () => renderer.stats,
    getTickMs: () => client.perf.tickMsAvg,
    typeKey: (typeId) => unitIds[typeId] ?? 'unknown',
    mode: () => ready.mode,
    localPlayer: () => LOCAL_PLAYER,
    intents,
  });
  const unmountHud = mountHud(hudHost, {
    intents: bridge.intents,
    onMinimapHost: mountMinimap,
    now: () => performance.now(),
    overlayVisible: params.debug || params.perf !== null,
  });

  const runtime: GameRuntime = {
    params,
    ready,
    assets: loaded ? 'provisional' : 'procedural',
    client,
    renderer,
    input: ctl,
    fog,
    fogRenderer,
    metrics() {
      const s = renderer.stats;
      return {
        updateMs: s.updateMs,
        renderMs: s.renderMs,
        drawCalls: s.drawCalls,
        inputToMarkerMs,
        reactRendersPerSec: reactRendersPerSec(performance.now()),
        mode: ready.mode,
        fps: s.fps,
        frameMs: s.frameMs,
        visibleUnits: s.visibleUnits,
        visibleChunks: s.visibleChunks,
        fogUploads: fogRenderer.fogUploads,
        minimapDraws: minimap?.draws ?? 0,
      };
    },
    mapW,
    mapH,
    lastTurnHash: null,
    view: () => current,
    units() {
      const v = current;
      if (!v) return [];
      const out: ReinosUnit[] = [];
      for (let s = 0; s < v.highWater; s++) {
        if (((v.flags[s] ?? 0) & FLAG_ALIVE) === 0 || !fog.isSlotVisible(v, s)) continue;
        const p = interpolatedPos(v, s, lastAlpha);
        const w = gridToWorld(p.x / 1000, p.y / 1000);
        const sp = worldToScreen(renderer.camera, renderer.viewport, w.x, w.y);
        out.push({
          eid: v.eid(s),
          owner: v.owner[s] ?? 255,
          typeId: v.typeId[s] ?? 0,
          sx: sp.x,
          sy: sp.y,
        });
      }
      return out;
    },
    perfReport() {
      const dt = new Float32Array(samples);
      const up = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const k = (sampleHead - samples + i + PERF_SAMPLES) % PERF_SAMPLES;
        dt[i] = frameDt[k] ?? 0;
        up[i] = frameUpdate[k] ?? 0;
      }
      dt.sort();
      up.sort();
      let sum = 0;
      for (const v of dt) sum += v;
      return {
        scenario: params.scenario,
        mode: ready.mode,
        frames: samples,
        fpsAvg: sum > 0 ? (samples * 1000) / sum : 0,
        // p5 of FPS = FPS of the 95th-percentile frame time
        fpsP5: percentile(dt, samples, 95) > 0 ? 1000 / percentile(dt, samples, 95) : 0,
        updateMs: {
          p50: percentile(up, samples, 50),
          p95: percentile(up, samples, 95),
          max: up[samples - 1] ?? 0,
        },
        drawCalls: renderer.stats.drawCalls,
        sim: { ...client.perf },
        note: 'Proxy only unless taken on the reference hardware (ADR-006 §10.1); K1 needs a real-GPU measurement.',
      };
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDownCapture, true);
      unsubSelection();
      detachInput();
      ctl.dispose();
      bridge.dispose();
      unmountHud();
      minimap?.dispose();
      minimap = null;
      box.dispose();
      renderer.layers.fog.removeChild(fogRenderer.view);
      fogRenderer.dispose();
      renderer.dispose();
      loaded?.destroy();
      if (!loaded) unitAtlas.destroy();
      client.dispose();
      stage.remove();
    },
  };

  const offTurn = client.onTurn((t) => {
    runtime.lastTurnHash = t.hash;
  });
  const baseDispose = runtime.dispose;
  runtime.dispose = () => {
    offTurn();
    baseDispose();
  };

  renderer.start();
  return runtime;
}
