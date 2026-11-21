import { describe, expect, it } from 'vitest';
import { bundledRaw, buildSimData, loadGameData, parseSchemas } from '../src/index';

type Block = Record<string, unknown>;
const withBlock = (key: 'camera' | 'selection', patch: (b: Block) => void) => {
  const raw = structuredClone(bundledRaw) as typeof bundledRaw & {
    game: { camera: Block; selection: Block };
  };
  patch(raw.game[key]);
  return raw;
};

describe('game.json camera/selection blocks (ADR-006 §4.2, §5)', () => {
  const game = loadGameData().game;

  it('loads the shipped values', () => {
    expect(game.camera).toEqual({
      panSpeedPxPerS: 900,
      edgeBandPx: 20,
      edgeDelayMs: 150,
      zoomTauMs: 80,
    });
    expect(game.selection.maxUnits).toBe(200);
  });

  it('are required', () => {
    for (const key of ['camera', 'selection'] as const) {
      const raw = structuredClone(bundledRaw) as { game: Record<string, unknown> };
      delete raw.game[key];
      expect(() => parseSchemas(raw as typeof bundledRaw)).toThrow();
    }
  });

  it('camera is strict: integers, positive, no unknown keys', () => {
    expect(() => parseSchemas(withBlock('camera', (b) => (b.extra = 1)))).toThrow();
    expect(() => parseSchemas(withBlock('camera', (b) => (b.panSpeedPxPerS = 900.5)))).toThrow();
    expect(() => parseSchemas(withBlock('camera', (b) => (b.edgeBandPx = 0)))).toThrow();
    expect(() => parseSchemas(withBlock('camera', (b) => (b.zoomTauMs = -1)))).toThrow();
    expect(() => parseSchemas(withBlock('camera', (b) => delete b.edgeDelayMs))).toThrow();
    expect(() => parseSchemas(withBlock('camera', (b) => (b.edgeDelayMs = 0)))).not.toThrow();
  });

  it('selection.maxUnits is a positive integer <= 1024 (MAX_CMD_UNITS)', () => {
    expect(() => parseSchemas(withBlock('selection', (b) => (b.maxUnits = 1024)))).not.toThrow();
    expect(() => parseSchemas(withBlock('selection', (b) => (b.maxUnits = 1025)))).toThrow();
    expect(() => parseSchemas(withBlock('selection', (b) => (b.maxUnits = 0)))).toThrow();
    expect(() => parseSchemas(withBlock('selection', (b) => (b.maxUnits = 1.5)))).toThrow();
    expect(() => parseSchemas(withBlock('selection', (b) => (b.extra = 1)))).toThrow();
  });

  it('does not leak into SimData (presentation-only)', () => {
    const sim = buildSimData(loadGameData());
    expect(JSON.stringify(sim)).not.toContain('panSpeedPxPerS');
    expect(JSON.stringify(sim)).not.toContain('maxUnits');
  });
});
