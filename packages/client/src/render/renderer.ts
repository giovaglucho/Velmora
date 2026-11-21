// ADR-006 §4.5 — Pixi Renderer. Owner: render-engineer (R2/R3). May use Pixi; never React or @reinos/sim.
import type { GameData } from '@reinos/data';
import type { SimClient } from '../worker/client';
import type { TerrainMap } from './terrain/terrainMap';
import type { Camera } from './types';

export interface RenderStats {
  fps: number;
  frameMs: number;
  updateMs: number;
  drawCalls: number;
  visibleChunks: number;
  visibleUnits: number;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  simClient: SimClient;
  data: GameData;
  terrain: TerrainMap;
}

export interface Renderer {
  start(): void;
  resize(w: number, h: number): void;
  camera: Camera;
  readonly stats: Readonly<RenderStats>;
  setLocalPlayer(id: number): void;
  dispose(): void;
}

export function createRenderer(_opts: RendererOptions): Promise<Renderer> {
  throw new Error('TODO(R2): createRenderer');
}
