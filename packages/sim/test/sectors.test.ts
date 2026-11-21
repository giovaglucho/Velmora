import { describe, expect, it } from 'vitest';
import { createPrng } from '@reinos/shared';
import { MAX_EDGES, createGrid, createSectorGraph } from '../src/index';
import { floodLabels, randomGrid } from './helpers/maps';

/** Union-find over graph nodes through their edges. */
function graphComponents(graph: ReturnType<typeof createSectorGraph>): Int32Array {
  const parent = new Int32Array(graph.nodeCap).map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]!]!;
      a = parent[a]!;
    }
    return a;
  };
  for (let n = 0; n < graph.nodeCap; n++) {
    if (graph.nodeTile[n]! < 0) continue;
    for (let e = 0; e < graph.edgeCount[n]!; e++) {
      const m = graph.edgeTo[n * MAX_EDGES + e]!;
      parent[find(n)] = find(m);
    }
  }
  return parent.map((_, i) => find(i));
}

describe('grafo de sectores', () => {
  it('conectividad del grafo == flood fill de casillas (10^3 pares, tamaños no múltiplos de 16)', () => {
    let pairs = 0;
    for (let m = 0; m < 12; m++) {
      const w = 20 + ((m * 13) % 60);
      const h = 17 + ((m * 29) % 50);
      const g = randomGrid(w, h, 1000 + m, 25 + (m % 4) * 6);
      const graph = createSectorGraph(g);
      const uf = graphComponents(graph);
      const lab = floodLabels(g);
      const nodes: number[] = [];
      for (let n = 0; n < graph.nodeCap; n++) if (graph.nodeTile[n]! >= 0) nodes.push(n);
      expect(nodes.length).toBeGreaterThan(0);
      const rng = createPrng(m + 5);
      for (let k = 0; k < 90 && nodes.length > 1; k++) {
        const a = nodes[rng.nextInt(nodes.length)]!;
        const b = nodes[rng.nextInt(nodes.length)]!;
        const same = lab[graph.nodeTile[a]!] === lab[graph.nodeTile[b]!];
        expect(uf[a] === uf[b]).toBe(same);
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(1000);
  });

  it('bordes de 1 casilla y mapas pequeños no rompen el grafo', () => {
    for (const [w, h] of [
      [17, 17],
      [33, 1],
      [1, 40],
      [16, 16],
      [31, 18],
    ] as const) {
      const g = createGrid(w, h);
      const graph = createSectorGraph(g);
      const fresh = createSectorGraph(g);
      expect(graph.hash()).toBe(fresh.hash());
    }
  });

  it('el grafo reconstruido incrementalmente es idéntico al construido desde cero', () => {
    const rng = createPrng(321);
    for (let m = 0; m < 6; m++) {
      const w = 40 + rng.nextInt(40);
      const h = 35 + rng.nextInt(40);
      const g = randomGrid(w, h, 77 + m, 20);
      const graph = createSectorGraph(g);
      for (let round = 0; round < 25; round++) {
        const kind = rng.nextInt(3);
        const x = rng.nextInt(w);
        const y = rng.nextInt(h);
        if (kind === 0) g.setTerrain(x, y, rng.nextInt(2) === 1);
        else if (kind === 1) g.occupyRect(x, y, 1 + rng.nextInt(5), 1 + rng.nextInt(5));
        else g.releaseRect(x, y, 1 + rng.nextInt(5), 1 + rng.nextInt(5));
        if (rng.nextInt(2) === 0) g.flush();
        if (rng.nextInt(3) === 0) {
          graph.sync();
          const scratch = createSectorGraph(g);
          expect(graph.hash()).toBe(scratch.hash());
        }
      }
      graph.sync();
      expect(graph.hash()).toBe(createSectorGraph(g).hash());
    }
  });
});
