import { describe, expect, it } from 'vitest';
import {
  KIND_FOREST,
  KIND_ROCK,
  KIND_WATER,
  OBSTACLE_FOREST,
  OBSTACLE_LAKE,
  buildHardSplat,
  buildSplatWeights,
  buildTerrainMap,
  decodeBlockedRle,
} from '../../src/render/terrain/terrainMap';
import {
  OBSTACLE_FOREST as SC_FOREST,
  OBSTACLE_LAKE as SC_LAKE,
  SCENARIO_NAMES,
  buildScenario,
  buildScenarioObstacles,
} from '../../src/worker/scenarios';
import { generateGround, generateNoise } from '../../src/render/terrain/procGen';

describe('terrain map (ADR-006 §4.6)', () => {
  it('decodes alternating RLE starting with FREE', () => {
    expect([...decodeBlockedRle([2, 3, 1, 2], 8)]).toEqual([0, 0, 1, 1, 1, 0, 1, 1]);
    expect([...decodeBlockedRle([0, 4], 4)]).toEqual([1, 1, 1, 1]);
    expect([...decodeBlockedRle([8], 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('is deterministic per seed and differs across seeds', () => {
    const a = buildTerrainMap(64, 48, [64 * 48], 5);
    const b = buildTerrainMap(64, 48, [64 * 48], 5);
    const c = buildTerrainMap(64, 48, [64 * 48], 6);
    expect(a.kind).toEqual(b.kind);
    expect(a.splat).toEqual(b.splat);
    expect(a.kind).not.toEqual(c.kind);
    expect(a.kind.length).toBe(64 * 48);
    expect(a.splat.length).toBe(65 * 49 * 4);
  });
  it('uses all of grass/dirt/sand on a 128² map and marks blocked tiles as forest/water, not rock', () => {
    const W = 128;
    const rle = [10 * W + 10, 5, W - 5, 5, W * W - (10 * W + 10 + 5 + W - 5 + 5)];
    const m = buildTerrainMap(W, W, rle, 1);
    const hist = [0, 0, 0, 0];
    for (const k of m.kind) hist[k] = (hist[k] ?? 0) + 1;
    expect(hist[0]).toBeGreaterThan(W * W * 0.3);
    expect(hist[1]).toBeGreaterThan(200);
    expect(hist[2]).toBeGreaterThan(200);
    expect(hist[KIND_ROCK]).toBeGreaterThan(0); // natural walkable rock patches still exist
    const blocked = decodeBlockedRle(rle, W * W);
    for (let i = 0; i < blocked.length; i++) if (blocked[i]) expect(m.kind[i]).toBe(KIND_FOREST);
  });
  it('per-vertex weights: share of each layer among the tiles around the vertex, ≈ sum 255', () => {
    // 2×2 map: kinds [0,1 / 2,3]
    const w = buildSplatWeights(new Uint8Array([0, 1, 2, 3]), 2, 2);
    const at = (i: number, j: number) => [...w.subarray((j * 3 + i) * 4, (j * 3 + i) * 4 + 4)];
    expect(at(1, 1)).toEqual([64, 64, 64, 64]); // centre vertex: 1/4 each
    expect(at(0, 0)).toEqual([255, 0, 0, 0]); // corner: only tile (0,0)
    expect(at(2, 2)).toEqual([0, 0, 0, 255]);
    expect(at(1, 0)).toEqual([128, 128, 0, 0]); // edge vertex between tiles 0 and 1
    const big = buildTerrainMap(40, 40, [1600], 9);
    for (let i = 0; i < 41 * 41; i++) {
      const s =
        (big.splat[i * 4] ?? 0) +
        (big.splat[i * 4 + 1] ?? 0) +
        (big.splat[i * 4 + 2] ?? 0) +
        (big.splat[i * 4 + 3] ?? 0);
      expect(Math.abs(s - 255)).toBeLessThanOrEqual(2);
    }
  });
  it('weights are continuous: neighbouring vertices differ by at most 1/2 per layer', () => {
    const m = buildTerrainMap(64, 64, [4096], 3);
    const vw = 65;
    let worst = 0;
    for (let j = 0; j < 65; j++)
      for (let i = 0; i < 64; i++)
        for (let k = 0; k < 4; k++)
          worst = Math.max(
            worst,
            Math.abs(
              (m.splat[(j * vw + i) * 4 + k] ?? 0) - (m.splat[(j * vw + i + 1) * 4 + k] ?? 0),
            ),
          );
    // a vertex mixes ≤ 4 tiles; sliding one vertex changes at most 2 of them → ≤ 50 % (+ rounding)
    expect(worst).toBeLessThanOrEqual(129);
  });
  it('hard (control) splat is one-hot per tile', () => {
    const h = buildHardSplat(new Uint8Array([0, 1, 2, 3]), 2, 2).splat;
    expect([...h.subarray(0, 4)]).toEqual([255, 0, 0, 0]);
    expect([...h.subarray(4, 8)]).toEqual([0, 255, 0, 0]);
    expect([...h.subarray(3 * 4, 3 * 4 + 4)]).toEqual([0, 0, 255, 0]);
    const o = buildHardSplat(new Uint8Array([4, 5, 0, 0]), 2, 2);
    expect([...o.splat2.subarray(0, 4)]).toEqual([255, 0, 0, 0]);
    expect([...o.splat2.subarray(4, 8)]).toEqual([0, 255, 0, 0]);
  });
  it('blocked tiles are water/forest by obstacle class (forest by default) and never natural rock', () => {
    const W = 32;
    const obstacles = new Uint8Array(W * W);
    obstacles.fill(OBSTACLE_LAKE, 0, 4); // tiles 0..3 lake, 4..7 forest, 8..11 blocked w/o class
    obstacles.fill(OBSTACLE_FOREST, 4, 8);
    const m = buildTerrainMap(W, W, [0, 12, W * W - 12], 4, obstacles);
    for (let i = 0; i < 4; i++) expect(m.kind[i]).toBe(KIND_WATER);
    for (let i = 4; i < 8; i++) expect(m.kind[i]).toBe(KIND_FOREST);
    const noClass = buildTerrainMap(W, W, [0, 12, W * W - 12], 4);
    for (let i = 0; i < 12; i++) expect(noClass.kind[i]).toBe(KIND_FOREST);
    // walkable tiles may be natural rock but never water/forest
    for (let i = 12; i < W * W; i++) expect(m.kind[i]).toBeLessThan(KIND_WATER);
    // weights of both splat textures sum to ≈255 per vertex
    for (let v = 0; v < 33 * 33; v++) {
      let sum = 0;
      for (let c = 0; c < 4; c++) sum += (m.splat[v * 4 + c] ?? 0) + (m.splat2[v * 4 + c] ?? 0);
      expect(Math.abs(sum - 255)).toBeLessThanOrEqual(3);
    }
  });
  it('obstacle class ids match the scenario classification (worker/scenarios.ts)', () => {
    expect(OBSTACLE_LAKE).toBe(SC_LAKE);
    expect(OBSTACLE_FOREST).toBe(SC_FOREST);
  });
  it('scenario classes cover exactly the sim-blocked tiles (same blocked set as blockedRle)', () => {
    for (const name of SCENARIO_NAMES) {
      const cfg = buildScenario(name, 1);
      const obs = buildScenarioObstacles(name, 1);
      const blocked = decodeBlockedRle(cfg.map.blockedRle, obs.length);
      let lakes = 0;
      let forests = 0;
      for (let i = 0; i < obs.length; i++) {
        expect(obs[i] !== 0).toBe(blocked[i] === 1);
        if (obs[i] === SC_LAKE) lakes++;
        if (obs[i] === SC_FOREST) forests++;
      }
      expect(lakes).toBeGreaterThan(50);
      expect(forests).toBeGreaterThan(20);
    }
  });
});

describe('procedural textures (stand-in for A1)', () => {
  it('are deterministic and fully opaque ground', () => {
    const a = generateGround(0, 64);
    const b = generateGround(0, 64);
    expect(a).toEqual(b);
    expect(generateGround(1, 64)).not.toEqual(a);
    for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(255);
  });
  it('tile: the seam between opposite borders is as smooth as any interior column pair', () => {
    const size = 128;
    for (const t of [0, 1, 2, 3].map((k) => generateGround(k, size))) {
      const diff = (xa: number, xb: number) => {
        let s = 0;
        for (let y = 0; y < size; y++)
          for (let c = 0; c < 3; c++)
            s += Math.abs((t[(y * size + xa) * 4 + c] ?? 0) - (t[(y * size + xb) * 4 + c] ?? 0));
        return s / (size * 3);
      };
      let interior = 0;
      for (let x = 0; x < size - 1; x++) interior += diff(x, x + 1);
      interior /= size - 1;
      const seamX = diff(size - 1, 0);
      expect(seamX).toBeLessThanOrEqual(interior * 1.6 + 0.5);
      // same along y
      let sy = 0;
      for (let x = 0; x < size; x++)
        for (let c = 0; c < 3; c++)
          sy += Math.abs((t[((size - 1) * size + x) * 4 + c] ?? 0) - (t[x * 4 + c] ?? 0));
      let iy = 0;
      for (let y = 0; y < size - 1; y++)
        for (let x = 0; x < size; x++)
          for (let c = 0; c < 3; c++)
            iy += Math.abs(
              (t[(y * size + x) * 4 + c] ?? 0) - (t[((y + 1) * size + x) * 4 + c] ?? 0),
            );
      iy /= (size - 1) * size * 3;
      expect(sy / (size * 3)).toBeLessThanOrEqual(iy * 1.6 + 0.5);
    }
  });
  it('noise has 4 distinct channels with real variance', () => {
    const n = generateNoise(64);
    const mean = [0, 0, 0, 0];
    for (let i = 0; i < n.length; i += 4)
      for (let c = 0; c < 4; c++) mean[c] = (mean[c] ?? 0) + (n[i + c] ?? 0);
    for (let c = 0; c < 4; c++) mean[c] = (mean[c] ?? 0) / 4096;
    for (const m of mean) expect(m).toBeGreaterThan(80);
    expect(n.filter((_, i) => i % 4 === 0)).not.toEqual(n.filter((_, i) => i % 4 === 1));
  });
});
