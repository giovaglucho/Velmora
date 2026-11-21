// ADR-006 §4.5 — Pixi Renderer. Owner: render-engineer (R2/R3). May use Pixi; never React or @reinos/sim.
import { Application, Container, type WebGLRenderer } from 'pixi.js';
import type { SimClient } from '../worker/client';
import type { SnapshotView } from '../worker/snapshot';
import { clampCamera, createCamera, stepZoom } from './camera';
import { visibleTileRange } from './culling';
import { DecalLayer } from './entities/markers';
import { createProceduralUnitAtlas, type UnitAtlas } from './entities/atlas';
import { UnitLayer, type SlotVisible } from './entities/unitLayer';
import { interpolationAlpha, gridToWorld } from './iso';
import { TerrainView } from './terrain/chunks';
import type { TerrainMap } from './terrain/terrainMap';
import { createProceduralTerrainTextures, type TerrainTextures } from './terrain/textures';
import type { Camera, Viewport } from './types';

export interface RenderStats {
  fps: number;
  /** rAF-to-rAF time (EMA, ms). */
  frameMs: number;
  /** JS cost per frame of interpolation + culling + sprite/ring/marker updates (no rasterisation). */
  updateMs: number;
  /** JS cost of Pixi's render() submission. */
  renderMs: number;
  /** gl.draw* calls issued by the previous frame. */
  drawCalls: number;
  visibleChunks: number;
  visibleUnits: number;
  visibleRings: number;
  /** Frames rendered so far. */
  frames: number;
}

/** The part of SimClient the renderer consumes (tests/harness pass a fake). */
export type SnapshotFeed = Pick<SimClient, 'latest' | 'latestArrivalMs'>;

/** What the integration receives once per frame, after the snapshot of the frame is known. */
export interface FrameContext {
  /** The frame's snapshot (valid until the next frame; null before the first one). */
  view: SnapshotView | null;
  /** Interpolation factor of this frame (ADR-006 §3.7). */
  alpha: number;
  /** ms since the previous frame. */
  dtMs: number;
  /** performance.now() at the start of the frame. */
  nowMs: number;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  simClient: SnapshotFeed;
  terrain: TerrainMap;
  /** game.json camera.zoomTauMs (value lives in data, passed in by the integration). */
  zoomTauMs: number;
  /** Footprint radius per typeId in Fx (SimData.radiusFx) for selection rings. */
  unitRadiusFx: ArrayLike<number>;
  /** Defaults to the in-memory procedural set; art-pipeline's loader plugs in here. */
  terrainTextures?: TerrainTextures;
  unitAtlas?: UnitAtlas;
  /** Seam-metric negative control (Q3): independent hard-edged tiles. */
  hardTerrainTiles?: boolean;
  background?: number;
  /**
   * Start of each frame, before the camera is applied. When given, the integration owns camera motion
   * (pan, edge scroll, zoom easing: CameraController.step) and the renderer does not step the zoom itself.
   */
  beforeFrame?: (dtMs: number) => void;
  /** After the frame's snapshot is known and before sprites are updated (fog update, minimap, HUD feed). */
  onFrame?: (f: FrameContext) => void;
  /** Right after Pixi's render() submission (input→marker latency probes). */
  afterRender?: (nowMs: number) => void;
  /** Fog of war: false hides the slot's sprites (enemy/neutral units on non-visible tiles). */
  slotVisible?: SlotVisible;
}

export interface RenderLayers {
  terrain: Container;
  decals: Container;
  entities: Container;
  /** Empty; the fog renderer (R6) adds its overlay here. */
  fog: Container;
}

export interface Renderer {
  start(): void;
  stop(): void;
  /** Renders exactly one frame now (tests / fixed captures). */
  frameOnce(): void;
  resize(w: number, h: number): void;
  camera: Camera;
  readonly viewport: Viewport;
  readonly layers: RenderLayers;
  readonly stats: Readonly<RenderStats>;
  /** Pixi world container: screen = world·zoom + (vw/2, vh/2) − cam·zoom. */
  readonly world: Container;
  setLocalPlayer(id: number): void;
  readonly localPlayer: number;
  /** Selected eids to draw rings for (the input layer owns the selection). */
  setSelected(eids: readonly number[]): void;
  /** Order marker at a grid position (tiles); call from the input handler: it shows in the same frame. */
  spawnMarker(gx: number, gy: number): void;
  dispose(): void;
}

const TERRAIN_CULL_MARGIN_TILES = 1;
const COUNTED = [
  'drawElements',
  'drawArrays',
  'drawElementsInstanced',
  'drawArraysInstanced',
] as const;

export async function createRenderer(opts: RendererOptions): Promise<Renderer> {
  const { canvas, simClient, terrain } = opts;
  const app = new Application();
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const vp: Viewport = {
    vw: canvas.clientWidth || canvas.width || 1280,
    vh: canvas.clientHeight || canvas.height || 720,
  };
  await app.init({
    canvas,
    width: vp.vw,
    height: vp.vh,
    preference: 'webgl',
    antialias: false,
    background: opts.background ?? 0x0b0d10,
    resolution: Math.min(dpr, 2),
    autoDensity: true,
    roundPixels: false,
    powerPreference: 'high-performance',
    autoStart: false,
    sharedTicker: false,
  });
  const webgl = app.renderer as WebGLRenderer;

  // --- draw-call counter (monkey patch of the GL context, restored on dispose) ---
  let calls = 0;
  const gl = webgl.gl as unknown as Record<string, unknown>;
  const originals: Array<[string, unknown]> = [];
  for (const name of COUNTED) {
    const orig = gl[name];
    if (typeof orig !== 'function') continue;
    originals.push([name, orig]);
    const bound = (orig as (...a: unknown[]) => unknown).bind(gl);
    gl[name] = (a: unknown, b: unknown, c: unknown, d: unknown, e: unknown) => {
      calls++;
      return bound(a, b, c, d, e);
    };
  }

  const world = new Container();
  const layers: RenderLayers = {
    terrain: new Container(),
    decals: new Container(),
    entities: new Container(),
    fog: new Container(),
  };
  world.addChild(layers.terrain, layers.decals, layers.entities, layers.fog);
  app.stage.addChild(world);

  const terrainView = new TerrainView(
    layers.terrain,
    terrain,
    opts.terrainTextures ?? createProceduralTerrainTextures(),
    { hardTiles: opts.hardTerrainTiles === true },
  );
  const atlas = opts.unitAtlas ?? createProceduralUnitAtlas();
  const units = new UnitLayer(layers.entities, atlas);
  const decals = new DecalLayer(layers.decals, opts.unitRadiusFx);

  const camera = createCamera();
  const start0 = gridToWorld(terrain.width / 2, terrain.height / 2);
  camera.x = start0.x;
  camera.y = start0.y;

  const stats: RenderStats = {
    fps: 0,
    frameMs: 0,
    updateMs: 0,
    renderMs: 0,
    drawCalls: 0,
    visibleChunks: 0,
    visibleUnits: 0,
    visibleRings: 0,
    frames: 0,
  };
  let localPlayer = 0;
  let running = false;
  let raf = 0;
  let lastT = -1;
  let disposed = false;

  const frame = (): void => {
    const t0 = performance.now();
    const dt = lastT < 0 ? 16.7 : t0 - lastT;
    lastT = t0;
    stats.drawCalls = calls;
    calls = 0;

    // camera: animated zoom, limits, world transform
    if (opts.beforeFrame) opts.beforeFrame(dt);
    else stepZoom(camera, dt, opts.zoomTauMs);
    clampCamera(camera, terrain.width, terrain.height);
    const z = camera.zoomT;
    world.scale.set(z);
    world.position.set(vp.vw / 2 - camera.x * z, vp.vh / 2 - camera.y * z);

    stats.visibleChunks = terrainView.update(
      visibleTileRange(camera, vp, terrain.width, terrain.height, TERRAIN_CULL_MARGIN_TILES),
    );
    const view = simClient.latest();
    const alpha = view ? interpolationAlpha(t0, simClient.latestArrivalMs, view.tickIntervalUs) : 0;
    opts.onFrame?.({ view, alpha, dtMs: dt, nowMs: t0 });
    units.update(view, alpha, camera, vp, opts.slotVisible);
    decals.update(view, alpha, t0);
    stats.visibleUnits = units.visibleUnits;
    stats.visibleRings = decals.ringsShown;
    const t1 = performance.now();
    stats.updateMs = t1 - t0;

    webgl.render({ container: app.stage });
    const t2 = performance.now();
    stats.renderMs = t2 - t1;
    opts.afterRender?.(t2);
    stats.frames++;
    stats.frameMs = stats.frameMs === 0 ? dt : stats.frameMs * 0.9 + dt * 0.1;
    stats.fps = 1000 / stats.frameMs;
  };

  const loop = (): void => {
    if (!running) return;
    frame();
    raf = requestAnimationFrame(loop);
  };

  return {
    camera,
    viewport: vp,
    layers,
    world,
    stats,
    get localPlayer() {
      return localPlayer;
    },
    setLocalPlayer(id) {
      localPlayer = id;
    },
    setSelected(eids) {
      decals.setSelected(eids);
    },
    spawnMarker(gx, gy) {
      decals.spawnMarker(gx, gy, performance.now());
    },
    start() {
      if (running || disposed) return;
      running = true;
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    frameOnce: frame,
    resize(w, h) {
      vp.vw = w;
      vp.vh = h;
      app.renderer.resize(w, h);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      for (const [name, orig] of originals) gl[name] = orig;
      units.dispose();
      decals.dispose();
      terrainView.dispose();
      if (!opts.unitAtlas) atlas.destroy();
      app.destroy(false, { children: true });
    },
  };
}
