// Fog/minimap harness for e2e/render/fog-*.spec.ts: a bare Pixi stage (no Renderer, no worker) that wires
// FogSystem + FogRenderer + Minimap to a FAKE snapshot source (ADR-006 §3.5 types). Bundled by the spec with esbuild.
import { Application, Container, Graphics } from 'pixi.js';
import { FogRenderer } from '../../../packages/client/src/render/fog/fogRenderer';
import { FogSystem } from '../../../packages/client/src/render/fog/fogSystem';
import { Minimap } from '../../../packages/client/src/render/minimap/minimap';
import { FakeSnapshotSource } from '../../../packages/client/test/render/fog/fakeSource';
import { HALF_H, HALF_W } from '../../../packages/client/src/render/constants';

const MAP = 32;
const LOS = [0, 4];
const TERRAIN = 0x40c040;
const SCALE = 0.19;
const VW = 800;
const VH = 440;
const c = (t: number) => t * 1000 + 500;

async function main(): Promise<void> {
  const cv = document.getElementById('c') as HTMLCanvasElement;
  const app = new Application();
  await app.init({
    canvas: cv,
    width: VW,
    height: VH,
    preference: 'webgl',
    antialias: false,
    background: 0x000000,
    resolution: 1,
    autoDensity: false,
  });

  const world = new Container();
  world.scale.set(SCALE);
  world.position.set(VW / 2, 16);
  app.stage.addChild(world);

  // Terrain stand-in: flat bright diamond, with a darker grid every 8 tiles so the fog is not the only structure.
  const terrain = new Graphics();
  const P = (gx: number, gy: number): [number, number] => [(gx - gy) * HALF_W, (gx + gy) * HALF_H];
  terrain.poly([...P(0, 0), ...P(MAP, 0), ...P(MAP, MAP), ...P(0, MAP)]).fill(TERRAIN);
  for (let k = 8; k < MAP; k += 8) {
    terrain
      .moveTo(...P(k, 0))
      .lineTo(...P(k, MAP))
      .stroke({ width: 10, color: 0x2a8a2a });
    terrain
      .moveTo(...P(0, k))
      .lineTo(...P(MAP, k))
      .stroke({ width: 10, color: 0x2a8a2a });
  }
  world.addChild(terrain);

  // Entities layer: one dot per slot, shown only when FogSystem says so (the unit layer's contract).
  const dots = new Graphics();
  world.addChild(dots);

  const sys = new FogSystem({
    width: MAP,
    height: MAP,
    maxPlayers: 3,
    capacity: 16,
    losTilesByType: LOS,
  });
  sys.setLocalPlayer(0);
  const fog = new FogRenderer(MAP, MAP);
  world.addChild(fog.view);

  const src = new FakeSnapshotSource(16, MAP, MAP);
  // Scenario: my scout walked (6,16) -> (22,16); an enemy stands in sight at (22,18), another far away at (4,4).
  const scout = { x: c(6), y: c(16), owner: 0, typeId: 1 };
  src.set(0, scout);
  src.set(1, { x: c(22), y: c(18), owner: 1, typeId: 1 });
  src.set(2, { x: c(4), y: c(4), owner: 1, typeId: 1 });
  src.set(3, { x: c(16), y: c(28), owner: 255, typeId: 0 }); // neutral far away
  src.set(4, { x: c(24), y: c(14), owner: 0, typeId: 0 }); // own, no vision
  let changed = false;
  let lastView = src.latest();
  const tick = (): void => {
    lastView = src.latest();
    if (sys.update(lastView)) changed = true;
  };
  for (let x = 6; x <= 22; x++) {
    src.set(0, { ...scout, x: c(x) });
    tick();
  }

  const mmCanvas = document.getElementById('mm') as HTMLCanvasElement;
  const minimap = new Minimap({
    canvas: mmCanvas,
    mapW: MAP,
    mapH: MAP,
    terrainRgb: (t) => (((t % MAP) + Math.floor(t / MAP)) & 1 ? 0x40c040 : 0x38b038),
  });
  const navigations: { gx: number; gy: number }[] = [];
  const orders: { gx: number; gy: number }[] = [];
  minimap.attachInput({
    onNavigate: (gx, gy) => navigations.push({ gx, gy }),
    onOrder: (gx, gy) => orders.push({ gx, gy }),
  });

  const redrawDots = (): void => {
    dots.clear();
    for (let s = 0; s < lastView.highWater; s++) {
      if (!sys.isSlotVisible(lastView, s)) continue;
      const gx = (lastView.posX[s] ?? 0) / 1000;
      const gy = (lastView.posY[s] ?? 0) / 1000;
      const [wx, wy] = P(gx, gy);
      const color =
        lastView.owner[s] === 0 ? 0x3b82f6 : lastView.owner[s] === 1 ? 0xef4444 : 0xcccccc;
      dots.circle(wx, wy, 60).fill(color);
    }
  };

  let lastNow = 0;
  const frame = (nowMs: number, dtSec: number): void => {
    fog.sync(sys, changed, dtSec);
    changed = false;
    redrawDots();
    // cameraGrid: the world rectangle shown by a fictitious camera over the middle of the map.
    minimap.update(nowMs, () => ({
      view: lastView,
      fog: sys.states,
      localPlayer: 0,
      visionMask: sys.visionMask,
      cameraGrid: [
        { x: 10, y: 10 },
        { x: 18, y: 10 },
        { x: 18, y: 18 },
        { x: 10, y: 18 },
      ],
    }));
    app.render();
    lastNow = nowMs;
  };
  frame(0, 0); // first call snaps (no fade) and draws everything once

  const screenOfTile = (tx: number, ty: number) => {
    const [wx, wy] = P(tx + 0.5, ty + 0.5);
    return {
      x: Math.round(world.position.x + wx * SCALE),
      y: Math.round(world.position.y + wy * SCALE),
    };
  };
  (window as unknown as Record<string, unknown>).__fogHarness = {
    ready: true,
    mapSize: MAP,
    fogState: (tx: number, ty: number) => sys.fogState(tx, ty),
    targetState: (tx: number, ty: number) => fog.targetState(tx, ty),
    shownValue: (tx: number, ty: number) => fog.shownValue(tx, ty),
    screenOfTile,
    visible: () =>
      Array.from({ length: lastView.highWater }, (_, s) => sys.isSlotVisible(lastView, s)),
    uploads: () => fog.fogUploads,
    fading: () => fog.fading,
    minimapDraws: () => minimap.draws,
    navigations,
    orders,
    /** Moves the scout one tile per call and runs one frame of `dtMs`. */
    moveScout: (tx: number, ty: number) => {
      src.set(0, { ...scout, x: c(tx), y: c(ty) });
      tick();
    },
    frame: (dtMs: number) => {
      lastNow += dtMs;
      frame(lastNow, dtMs / 1000);
    },
    settle: () => {
      for (let i = 0; i < 4; i++) frame(250, 0.25);
    },
  };
}

main().catch((e: unknown) => {
  console.error('FOG HARNESS FAIL', e);
  (window as unknown as Record<string, unknown>).__fogHarness = { ready: false, error: String(e) };
});
