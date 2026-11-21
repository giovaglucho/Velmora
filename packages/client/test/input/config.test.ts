import { describe, expect, it } from 'vitest';
import { loadGameData } from '@reinos/data';
import { readInputConfig } from '../../src/input/config';

describe('readInputConfig', () => {
  it('reads selection.maxUnits and the camera block from game.json (no code constants)', () => {
    const cfg = readInputConfig(loadGameData().game);
    expect(cfg.maxUnits).toBe(200);
    expect(cfg.camera).toEqual({
      panSpeedPxPerS: 900,
      edgeBandPx: 20,
      edgeDelayMs: 150,
      zoomTauMs: 80,
    });
  });
});
