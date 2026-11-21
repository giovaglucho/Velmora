import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import { MAX_WAYPOINTS } from '../src/index';
import {
  PATH_NONE,
  PATH_OK,
  PATH_PARTIAL,
  PATH_TRUNCATED,
  createPathResult,
  createPathfinder,
  createTileSearch,
  type PathResult,
  type Pathfinder,
} from '../src/index';
import {
  floodLabels,
  gridFromAscii,
  octileRef,
  polylineCost,
  randomGrid,
  refCost,
  segmentClear,
} from './helpers/maps';

const c = (t: number): number => t * 1000 + 500;
const query = (pf: Pathfinder, sx: number, sy: number, gx: number, gy: number): PathResult => {
  const out = createPathResult();
  pf.findPath({ startX: c(sx), startY: c(sy), goalX: c(gx), goalY: c(gy) }, out);
  return out;
};
const pts = (sx: number, sy: number, r: PathResult): { x: number; y: number }[] => {
  const p = [{ x: c(sx), y: c(sy) }];
  for (let i = 0; i < r.count; i++) p.push({ x: r.x[i]!, y: r.y[i]! });
  return p;
};
const sameResult = (a: PathResult, b: PathResult): boolean =>
  a.status === b.status &&
  a.count === b.count &&
  Array.from(a.x.subarray(0, a.count)).join() === Array.from(b.x.subarray(0, b.count)).join() &&
  Array.from(a.y.subarray(0, b.count)).join() === Array.from(b.y.subarray(0, b.count)).join();

describe('A* de casillas', () => {
  it('costo óptimo vs Dijkstra de referencia y pasos válidos (sin cortar esquinas)', () => {
    const rng = createPrng(4242);
    let checked = 0;
    for (let m = 0; m < 80; m++) {
      const w = 5 + rng.nextInt(22);
      const h = 5 + rng.nextInt(22);
      const g = randomGrid(w, h, 500 + m, 10 + rng.nextInt(35));
      const ts = createTileSearch(g);
      const out = new Int32Array(w * h + 4);
      for (let k = 0; k < 20; k++) {
        const s = rng.nextInt(w * h);
        const t = rng.nextInt(w * h);
        if (g.isBlocked(s % w, Math.floor(s / w)) || g.isBlocked(t % w, Math.floor(t / w)))
          continue;
        const ref = refCost(g, s, t);
        const n = ts.search(s, t, 0, 0, w, h, out, 0);
        if (ref < 0) {
          expect(n).toBe(-1);
          continue;
        }
        expect(ts.lastCost).toBe(ref);
        // walk the path: contiguous 8-neighbour steps over free tiles, no corner cutting
        let cost = 0;
        let prev = s;
        for (let i = 0; i < n; i++) {
          const cur = out[i]!;
          const dx = (cur % w) - (prev % w);
          const dy = Math.floor(cur / w) - Math.floor(prev / w);
          expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
          expect(g.isBlocked(cur % w, Math.floor(cur / w))).toBe(false);
          if (dx !== 0 && dy !== 0) {
            expect(g.isBlocked((prev % w) + dx, Math.floor(prev / w))).toBe(false);
            expect(g.isBlocked(prev % w, Math.floor(prev / w) + dy)).toBe(false);
          }
          cost += dx !== 0 && dy !== 0 ? 14 : 10;
          prev = cur;
        }
        expect(prev).toBe(t === s ? s : t);
        expect(cost).toBe(ref);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('desempate determinista: la misma consulta devuelve la misma ruta cruda', () => {
    const g = randomGrid(30, 30, 3, 20);
    const ts = createTileSearch(g);
    const a = new Int32Array(900);
    const b = new Int32Array(900);
    const na = ts.search(0, 899, 0, 0, 30, 30, a, 0);
    const nb = ts.search(0, 899, 0, 0, 30, 30, b, 0);
    expect(na).toBe(nb);
    expect(Array.from(a.subarray(0, na))).toEqual(Array.from(b.subarray(0, nb)));
  });
});

describe('pathfinder: rutas con obstáculos', () => {
  it('línea recta libre: un solo waypoint, la meta exacta', () => {
    const g = gridFromAscii(['..........', '..........', '..........']);
    const pf = createPathfinder(g);
    const out = createPathResult();
    pf.findPath({ startX: 700, startY: 800, goalX: 8300, goalY: 2100 }, out);
    expect(out.status).toBe(PATH_OK);
    expect(out.count).toBe(1);
    expect(out.x[0]).toBe(8300);
    expect(out.y[0]).toBe(2100);
  });

  it('muro con un hueco: la ruta pasa por el hueco', () => {
    const g = gridFromAscii([
      '.....#.....',
      '.....#.....',
      '.....#.....',
      '...........',
      '.....#.....',
      '.....#.....',
    ]);
    const pf = createPathfinder(g);
    const r = query(pf, 1, 1, 9, 1);
    expect(r.status).toBe(PATH_OK);
    const p = pts(1, 1, r);
    for (let i = 1; i < p.length; i++)
      expect(segmentClear(g, p[i - 1]!.x, p[i - 1]!.y, p[i]!.x, p[i]!.y)).toBe(true);
    expect(p.some((q) => Math.floor(q.x / 1000) === 5 && Math.floor(q.y / 1000) === 3)).toBe(true);
    expect(p[p.length - 1]).toEqual({ x: c(9), y: c(1) });
  });

  it('trampa en U: rodea la U', () => {
    const rows = [
      '....................',
      '..##########........',
      '..#........#........',
      '..#........#........',
      '..#........#........',
      '..#........#........',
      '..#........#........',
      '..#........#........',
      '..#........#........',
      '....................',
    ];
    // open the U toward the bottom: goal inside the pocket, start above the closed top
    const g = gridFromAscii(rows);
    const pf = createPathfinder(g);
    const r = query(pf, 6, 0, 6, 5);
    expect(r.status).toBe(PATH_OK);
    const p = pts(6, 0, r);
    for (let i = 1; i < p.length; i++)
      expect(segmentClear(g, p[i - 1]!.x, p[i - 1]!.y, p[i]!.x, p[i]!.y)).toBe(true);
    const ref = refCost(g, 0 * 20 + 6, 5 * 20 + 6);
    expect(polylineCost(p)).toBeLessThanOrEqual(ref);
  });

  it('laberinto serpenteante largo (multi-sector) llega a la meta', () => {
    const W = 70;
    const H = 40;
    const rows: string[] = [];
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        // horizontal walls every 4 rows with alternating gaps at the ends
        const wall = y % 4 === 2;
        const gapLeft = Math.floor(y / 4) % 2 === 0;
        row += wall && !(gapLeft ? x < 3 : x >= W - 3) ? '#' : '.';
      }
      rows.push(row);
    }
    const g = gridFromAscii(rows);
    const pf = createPathfinder(g);
    const r = query(pf, 0, 0, 0, 38);
    expect([PATH_OK, PATH_TRUNCATED]).toContain(r.status);
    expect(r.count).toBeGreaterThan(5);
    const p = pts(0, 0, r);
    for (let i = 1; i < p.length; i++)
      expect(segmentClear(g, p[i - 1]!.x, p[i - 1]!.y, p[i]!.x, p[i]!.y)).toBe(true);
  });
});

describe('pathfinder: OK ⇔ alcanzable, calidad y validez', () => {
  it('500 mapas semillados: estado según flood fill, segmentos libres, costo <= 1,25 x óptimo', () => {
    const rng = createPrng(2024);
    let worst = 0;
    let ok = 0;
    let partial = 0;
    let hier = 0;
    for (let m = 0; m < 500; m++) {
      const big = m % 5 === 0; // some multi-sector maps so the hierarchy runs
      const w = big ? 70 + rng.nextInt(40) : 8 + rng.nextInt(30);
      const h = big ? 60 + rng.nextInt(40) : 8 + rng.nextInt(30);
      const g = randomGrid(w, h, 9000 + m, 8 + rng.nextInt(big ? 22 : 40));
      const pf = createPathfinder(g);
      const lab = floodLabels(g);
      for (let k = 0; k < (big ? 3 : 4); k++) {
        const s = rng.nextInt(w * h);
        const t = rng.nextInt(w * h);
        const sx = s % w;
        const sy = Math.floor(s / w);
        const tx = t % w;
        const ty = Math.floor(t / w);
        if (g.isBlocked(sx, sy) || g.isBlocked(tx, ty) || s === t) continue;
        const r = query(pf, sx, sy, tx, ty);
        const reachable = lab[s] === lab[t];
        if (reachable) {
          expect(r.status === PATH_OK || r.status === PATH_TRUNCATED).toBe(true);
          if (r.status === PATH_OK) {
            const last = { x: r.x[r.count - 1], y: r.y[r.count - 1] };
            expect(last).toEqual({ x: c(tx), y: c(ty) });
          }
        } else {
          expect(r.status === PATH_PARTIAL || r.status === PATH_NONE).toBe(true);
        }
        const p = pts(sx, sy, r);
        for (let i = 1; i < p.length; i++)
          expect(segmentClear(g, p[i - 1]!.x, p[i - 1]!.y, p[i]!.x, p[i]!.y)).toBe(true);
        if (reachable && r.status === PATH_OK) {
          const ref = refCost(g, s, t);
          const cost = polylineCost(p);
          const ratio = cost / ref;
          if (ratio > worst) worst = ratio;
          expect(ratio).toBeLessThanOrEqual(1.25);
          ok++;
          if (big) hier++;
        } else if (!reachable) partial++;
      }
    }
    // documented slack: the worst measured ratio of smoothed hierarchical cost vs optimal grid cost
    console.log(
      'worst cost ratio (smoothed / optimal):',
      worst.toFixed(4),
      'ok',
      ok,
      'partial',
      partial,
      'multi-sector ok',
      hier,
    );
    expect(ok).toBeGreaterThan(300);
    expect(hier).toBeGreaterThan(20);
  });

  it('rutas multi-sector sobre mapa grande usan la jerarquía y respetan el óptimo', () => {
    const g = randomGrid(110, 110, 31337, 22);
    const pf = createPathfinder(g);
    const lab = floodLabels(g);
    const rng = createPrng(5);
    let n = 0;
    let worst = 0;
    while (n < 25) {
      const s = rng.nextInt(110 * 110);
      const t = rng.nextInt(110 * 110);
      if (g.isBlocked(s % 110, Math.floor(s / 110)) || g.isBlocked(t % 110, Math.floor(t / 110)))
        continue;
      if (lab[s] !== lab[t]) continue;
      const r = query(pf, s % 110, Math.floor(s / 110), t % 110, Math.floor(t / 110));
      if (r.status !== PATH_OK) continue;
      worst = Math.max(
        worst,
        polylineCost(pts(s % 110, Math.floor(s / 110), r)) / refCost(g, s, t),
      );
      n++;
    }
    console.log('110x110 worst ratio:', worst.toFixed(4), 'expandedNodes', pf.stats.expandedNodes);
    expect(worst).toBeLessThanOrEqual(1.25);
  });
});

describe('pathfinder: PARTIAL / NONE / TRUNCATED', () => {
  const rows = [
    '.......#........',
    '.......#........',
    '.......#...#....',
    '.......#...#....',
    '.......#..##....',
    '.......#........',
  ];
  it('PARTIAL termina en la casilla alcanzable más cercana (octil, empate: menor índice)', () => {
    const g = gridFromAscii(rows);
    const pf = createPathfinder(g);
    // start in the left half, goal on the right half: unreachable
    const r = query(pf, 1, 2, 12, 2);
    expect(r.status).toBe(PATH_PARTIAL);
    // closest reachable tiles to (12,2) are in column 6 (octile distance 6*10); lowest index wins
    const last = { x: r.x[r.count - 1], y: r.y[r.count - 1] };
    const lab = floodLabels(g);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < 16 * 6; i++) {
      if (lab[i] !== lab[2 * 16 + 1]) continue;
      const d = octileRef((i % 16) - 12, Math.floor(i / 16) - 2);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    expect(last).toEqual({ x: c(best % 16), y: c(Math.floor(best / 16)) });
  });
  it('PARTIAL con count 0 cuando ya está en la mejor casilla', () => {
    const g = gridFromAscii(rows);
    const pf = createPathfinder(g);
    const r = query(pf, 6, 0, 12, 0); // (6,0) is the closest reachable tile to (12,0)
    expect(r.status).toBe(PATH_PARTIAL);
    expect(r.count).toBe(0);
  });
  it('NONE: inicio aislado sin movimiento posible', () => {
    const g = gridFromAscii(['.....', '.###.', '.#.#.', '.###.', '.....']);
    const pf = createPathfinder(g);
    const r = query(pf, 2, 2, 0, 0);
    expect(r.status).toBe(PATH_NONE);
    expect(r.count).toBe(0);
    const same = query(pf, 2, 2, 2, 2);
    expect(same.status).toBe(PATH_OK); // already there
  });
  it('NONE: mapa completamente bloqueado', () => {
    const g = gridFromAscii(['###', '###']);
    const r = query(createPathfinder(g), 0, 0, 2, 1);
    expect(r.status).toBe(PATH_NONE);
  });
  it('inicio y meta bloqueados se reubican con nearestFree', () => {
    const g = gridFromAscii(['.....', '.###.', '.###.', '.....']);
    const pf = createPathfinder(g);
    const r = query(pf, 2, 1, 2, 2); // both inside the block
    expect([PATH_OK, PATH_PARTIAL]).toContain(r.status);
    expect(
      g.isBlocked(Math.floor(r.x[r.count - 1]! / 1000), Math.floor(r.y[r.count - 1]! / 1000)),
    ).toBe(false);
  });
  it('TRUNCATED: ruta suavizada con más de 64 waypoints devuelve los primeros 64', () => {
    // zig-zag wall pattern forces many direction changes
    const W = 140;
    const rows: string[] = [];
    for (let y = 0; y < 30; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const col = x % 2 === 1;
        // alternate gaps top/bottom on every odd column
        const gapTop = Math.floor(x / 2) % 2 === 0;
        row += col && !(gapTop ? y < 2 : y >= 28) ? '#' : '.';
      }
      rows.push(row);
    }
    const g = gridFromAscii(rows);
    const pf = createPathfinder(g);
    const r = query(pf, 0, 15, W - 1, 15);
    expect(r.status).toBe(PATH_TRUNCATED);
    expect(r.count).toBe(MAX_WAYPOINTS);
  });
});

describe('pathfinder: cachés transparentes', () => {
  it('con y sin cachés los resultados son idénticos y repetibles byte a byte', () => {
    const g = randomGrid(150, 120, 777, 20);
    const cached = createPathfinder(g);
    const cleared = createPathfinder(g);
    const rng = createPrng(17);
    for (let k = 0; k < 120; k++) {
      const q = {
        startX: rng.nextInt(150 * 1000),
        startY: rng.nextInt(120 * 1000),
        goalX: rng.nextInt(150 * 1000),
        goalY: rng.nextInt(120 * 1000),
      };
      const a = createPathResult();
      const b = createPathResult();
      const a2 = createPathResult();
      cached.findPath(q, a);
      cached.findPath(q, a2); // hit
      cleared.clearCaches();
      cleared.findPath(q, b);
      expect(sameResult(a, b)).toBe(true);
      expect(sameResult(a, a2)).toBe(true);
    }
    expect(cached.stats.cacheHits).toBeGreaterThanOrEqual(100);
    expect(cleared.stats.cacheHits).toBe(0);
  });
  it('un cambio de rejilla invalida la caché (nueva ruta respeta el obstáculo)', () => {
    const g = gridFromAscii(['..........', '..........', '..........']);
    const pf = createPathfinder(g);
    const a = query(pf, 0, 1, 9, 1);
    expect(a.count).toBe(1);
    g.occupyRect(4, 0, 1, 3);
    const b = query(pf, 0, 1, 9, 1);
    expect(b.status).toBe(PATH_PARTIAL); // wall closes the corridor
  });
  it('findPath en régimen estacionario no hace crecer el heap (10^4 consultas)', () => {
    const g = randomGrid(100, 100, 55, 20);
    const pf = createPathfinder(g);
    const out = createPathResult();
    const rng = createPrng(3);
    const run = (n: number): void => {
      for (let k = 0; k < n; k++)
        pf.findPath(
          {
            startX: rng.nextInt(100000),
            startY: rng.nextInt(100000),
            goalX: rng.nextInt(100000),
            goalY: rng.nextInt(100000),
          },
          out,
        );
    };
    run(2000); // warm up (heaps grow to their working size)
    globalThis.gc?.();
    const before = process.memoryUsage().arrayBuffers;
    run(10000);
    const after = process.memoryUsage().arrayBuffers;
    expect(after - before).toBeLessThan(2 * 1024 * 1024);
  });
});
