// ADR-006 §4.2, §5 — input tuning comes from packages/data (game.json blocks `camera` and `selection`).
import type { GameData } from '@reinos/data';

export interface InputConfig {
  /** selection.maxUnits (hard command cap is MAX_CMD_UNITS = 1024). */
  maxUnits: number;
  camera: {
    panSpeedPxPerS: number;
    edgeBandPx: number;
    edgeDelayMs: number;
    zoomTauMs: number;
  };
}

/** Reads the tuning from validated game data (Zod already guarantees ranges; no defaults here). */
export function readInputConfig(game: Pick<GameData['game'], 'camera' | 'selection'>): InputConfig {
  const { camera, selection } = game;
  return {
    maxUnits: selection.maxUnits,
    camera: {
      panSpeedPxPerS: camera.panSpeedPxPerS,
      edgeBandPx: camera.edgeBandPx,
      edgeDelayMs: camera.edgeDelayMs,
      zoomTauMs: camera.zoomTauMs,
    },
  };
}
