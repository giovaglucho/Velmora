import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import {
  createGrid,
  createGridFromMap,
  createSpatialHash,
  createWorld,
  loadMap,
  spawn,
} from '../src/index';
import { rleFromBlocked } from './helpers/fixtures';

describe('grid: RLE, bloqueo, versión', () => {
  it('RLE ida y vuelta, incl. tramos largos y tamaños no múltiplos de 16', () => {
    for (const [w, h] of [
      [1, 1],
      [17, 33],
      [50, 3],
      [100, 70],
    ] as const) {
      const rng = createPrng(w * 1000 + h);
      const blocked = new Set<number>();
      // long runs: fill whole rows sometimes
      for (let y = 0; y < h; y++) {
        if (rng.nextInt(5) === 0) for (let x = 0; x < w; x++) blocked.add(y * w + x);
        else if (rng.nextInt(3) === 0) blocked.add(y * w + rng.nextInt(w));
      }
      const g = createGridFromMap({
        width: w,
        height: h,
        blockedRle: rleFromBlocked(w, h, blocked),
      });
      expect(g.sectorsX).toBe(Math.ceil(w / 16));
      expect(g.sectorsY).toBe(Math.ceil(h / 16));
      for (let i = 0; i < w * h; i++) expect(g.terrain[i]).toBe(blocked.has(i) ? 1 : 0);
      expect(g.version).toBe(0); // loadMap is the baseline
    }
  });
  it('loadMap rechaza RLE que no suma width*height', () => {
    const g = createGrid(4, 4);
    expect(() => loadMap(g, { width: 4, height: 4, blockedRle: [15] })).toThrow();
    expect(() => loadMap(g, { width: 4, height: 4, blockedRle: [17] })).toThrow();
    expect(() => loadMap(g, { width: 5, height: 4, blockedRle: [20] })).toThrow();
  });
  it('fuera del mapa está bloqueado', () => {
    const g = createGrid(5, 5);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [5, 0],
      [0, 5],
    ] as const)
      expect(g.isBlocked(x, y)).toBe(true);
    expect(g.isBlocked(0, 0)).toBe(false);
  });
  it('ocupar y liberar un edificio restaura occ y suma 2 a version; no desbloquea terreno', () => {
    const g = createGrid(20, 20);
    g.setTerrain(5, 5, true);
    const v0 = g.version;
    const occ0 = Array.from(g.occ);
    g.occupyRect(4, 4, 3, 3);
    expect(g.isBlocked(6, 6)).toBe(true);
    expect(g.occ[5 * 20 + 5]).toBe(1);
    g.occupyRect(5, 5, 2, 2); // overlapping footprint
    expect(g.occ[5 * 20 + 5]).toBe(2);
    g.releaseRect(5, 5, 2, 2);
    g.releaseRect(4, 4, 3, 3);
    expect(Array.from(g.occ)).toEqual(occ0);
    expect(g.version).toBe(v0 + 4);
    expect(g.isBlocked(5, 5)).toBe(true); // terrain stays blocked
    expect(g.isBlocked(4, 4)).toBe(false);
    const g2 = createGrid(20, 20);
    g2.occupyRect(2, 2, 2, 2);
    g2.releaseRect(2, 2, 2, 2);
    expect(g2.version).toBe(2);
  });
  it('flush marca y limpia sectores sucios; sectorOf', () => {
    const g = createGrid(40, 40);
    expect(g.sectorOf(0, 0)).toBe(0);
    expect(g.sectorOf(16, 0)).toBe(1);
    expect(g.sectorOf(15, 16)).toBe(g.sectorsX);
    const seen: number[][] = [];
    g.addFlushListener((l, n) => seen.push(Array.from(l.subarray(0, n))));
    g.setTerrain(35, 2, true);
    g.setTerrain(1, 1, true);
    g.flush();
    g.flush();
    expect(seen).toEqual([[0, 2]]);
  });
});

function bruteNearestFree(
  blocked: (x: number, y: number) => boolean,
  w: number,
  h: number,
  tx: number,
  ty: number,
): { tx: number; ty: number } | null {
  for (let r = 0; r <= Math.max(w, h); r++) {
    for (let y = ty - r; y <= ty + r; y++)
      for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (!blocked(x, y)) return { tx: x, ty: y };
      }
  }
  return null;
}

describe('grid: nearestFree', () => {
  it('coincide con fuerza bruta (anillos Chebyshev, fila-mayor) en 10^4 casos', () => {
    const rng = createPrng(7);
    let cases = 0;
    for (let m = 0; m < 20; m++) {
      const w = 5 + rng.nextInt(30);
      const h = 5 + rng.nextInt(30);
      const g = createGrid(w, h);
      const dens = 20 + rng.nextInt(75);
      for (let i = 0; i < w * h; i++) if (rng.nextInt(100) < dens) g.terrain[i] = 1;
      for (let k = 0; k < 500; k++) {
        const tx = rng.nextInt(w + 4) - 2;
        const ty = rng.nextInt(h + 4) - 2;
        const out = { tx: -9, ty: -9 };
        const ok = g.nearestFree(tx, ty, out);
        const ref = bruteNearestFree((x, y) => g.isBlocked(x, y), w, h, tx, ty);
        expect(ok).toBe(ref !== null);
        if (ref) expect(out).toEqual(ref);
        cases++;
      }
    }
    expect(cases).toBe(10000);
  });
  it('devuelve false en un mapa completamente bloqueado', () => {
    const g = createGrid(8, 8);
    g.terrain.fill(1);
    expect(g.nearestFree(3, 3, { tx: 0, ty: 0 })).toBe(false);
  });
});

describe('grid: hash espacial', () => {
  it('vecinos ascendentes por ranura y coincide con fuerza bruta en 10^3 configuraciones', () => {
    const rng = createPrng(99);
    for (let cfg = 0; cfg < 1000; cfg++) {
      const w = 6 + rng.nextInt(10);
      const h = 6 + rng.nextInt(10);
      const g = createGrid(w, h);
      const world = createWorld(64);
      const n = rng.nextInt(40);
      for (let k = 0; k < n; k++)
        spawn(world, {
          typeId: 0,
          owner: 0,
          x: rng.nextInt(w * 1000),
          y: rng.nextInt(h * 1000),
          radius: 300,
          hp: 1,
        });
      const sh = createSpatialHash(g, 64);
      sh.rebuild(world);
      let total = 0;
      for (let ty = 0; ty < h; ty++)
        for (let tx = 0; tx < w; tx++) {
          sh.query(tx, ty);
          const got = Array.from(sh.slots.subarray(sh.start, sh.end));
          const want: number[] = [];
          for (let i = 0; i < n; i++)
            if (
              Math.floor((world.prevX[i] as number) / 1000) === tx &&
              Math.floor((world.prevY[i] as number) / 1000) === ty
            )
              want.push(i);
          expect(got).toEqual(want);
          total += got.length;
        }
      expect(total).toBe(n);
      sh.query(-1, 0);
      expect(sh.end - sh.start).toBe(0);
    }
  });
});
