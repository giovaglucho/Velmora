import { describe, expect, it } from 'vitest';
import { createPrng, isqrt } from '@reinos/shared';
import {
  FOG_EXPLORED,
  FOG_UNEXPLORED,
  FOG_VISIBLE,
  VisionGrid,
} from '../../../src/render/fog/visionGrid';
import { FakeSnapshotSource, type FakeUnit } from './fakeSource';

const FX = 1000;
const centre = (t: number) => t * FX + 500;
/** Gauss circle problem: lattice points with dx²+dy² ≤ r², r = 0..12. */
const GAUSS = [1, 5, 13, 29, 49, 81, 113, 149, 197, 253, 317, 377, 441];
const LOS = [0, 4, 7, 2]; // type 0: none, 1: r4, 2: r7, 3: r2

/** Independent brute-force reference (no incremental state, no isqrt). */
function reference(src: FakeSnapshotSource, W: number, H: number, players: number): Uint16Array[] {
  const view = src.latest();
  const out = Array.from({ length: players }, () => new Uint16Array(W * H));
  for (let s = 0; s < view.highWater; s++) {
    if (((view.flags[s] ?? 0) & 1) === 0) continue;
    const o = view.owner[s] ?? 255;
    const r = LOS[view.typeId[s] ?? 0] ?? 0;
    if (o >= players || r <= 0) continue;
    const tx = Math.min(W - 1, Math.floor((view.posX[s] ?? 0) / FX));
    const ty = Math.min(H - 1, Math.floor((view.posY[s] ?? 0) / FX));
    for (let y = Math.max(0, ty - r); y <= Math.min(H - 1, ty + r); y++)
      for (let x = Math.max(0, tx - r); x <= Math.min(W - 1, tx + r); x++) {
        const dx = x - tx;
        const dy = y - ty;
        if (dx * dx + dy * dy <= r * r) {
          const arr = out[o];
          if (arr) arr[y * W + x] = (arr[y * W + x] ?? 0) + 1;
        }
      }
  }
  return out;
}

describe('VisionGrid discs', () => {
  it('disc sizes r=1..12 equal the exact lattice counts (integer only)', () => {
    const g = new VisionGrid(8, 8, 2, 4);
    expect(g.diskSize(0)).toBe(0); // radius 0 = no vision
    for (let r = 1; r <= 12; r++) expect(g.diskSize(r)).toBe(GAUSS[r]);
  });
  it('isqrt row extents match brute force for r up to 64', () => {
    const g = new VisionGrid(8, 8, 2, 4);
    for (let r = 1; r <= 64; r++) {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) n += 2 * isqrt(r * r - dy * dy) + 1;
      let brute = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) brute++;
      expect(g.diskSize(r)).toBe(n);
      expect(n).toBe(brute);
    }
  });
  it('a settler (r=4) in the open marks exactly 49 tiles with refs 1', () => {
    const W = 32;
    const g = new VisionGrid(W, W, 2, 4);
    const src = new FakeSnapshotSource(4, W, W);
    src.set(0, { x: centre(16), y: centre(16), owner: 0, typeId: 1 });
    expect(g.update(src.latest(), LOS)).toBe(true);
    let n = 0;
    for (const v of g.refs(0)) n += v;
    expect(n).toBe(49);
    expect(g.refs(0)[16 * W + 16]).toBe(1);
    expect(g.refs(0)[16 * W + 20]).toBe(1);
    expect(g.refs(0)[16 * W + 21]).toBe(0);
    expect(g.refs(1).every((v) => v === 0)).toBe(true);
  });
  it('clips at the map border without leaking or underflowing', () => {
    const W = 10;
    const g = new VisionGrid(W, W, 1, 2);
    const src = new FakeSnapshotSource(2, W, W);
    src.set(0, { x: centre(0), y: centre(0), owner: 0, typeId: 2 });
    g.update(src.latest(), LOS);
    src.set(0, { x: centre(9), y: centre(9), owner: 0, typeId: 2 });
    g.update(src.latest(), LOS);
    const refs = g.refs(0);
    expect(refs[0]).toBe(0);
    expect(refs[9 * W + 9]).toBe(1);
    expect(Math.max(...refs)).toBe(1);
  });
});

describe('VisionGrid incremental behaviour', () => {
  it('no change -> update returns false and does nothing', () => {
    const g = new VisionGrid(16, 16, 2, 4);
    const src = new FakeSnapshotSource(4, 16, 16);
    src.set(0, { x: centre(5), y: centre(5), owner: 0, typeId: 1 });
    expect(g.update(src.latest(), LOS)).toBe(true);
    expect(g.update(src.latest(), LOS)).toBe(false);
    // sub-tile movement inside the same tile is not a change either
    src.set(0, { x: centre(5) + 300, y: centre(5) - 200, owner: 0, typeId: 1 });
    expect(g.update(src.latest(), LOS)).toBe(false);
  });
  it('add/subtract is symmetric: moving away and back restores refs exactly', () => {
    const W = 24;
    const g = new VisionGrid(W, W, 1, 4);
    const src = new FakeSnapshotSource(4, W, W);
    src.set(0, { x: centre(10), y: centre(10), owner: 0, typeId: 1 });
    g.update(src.latest(), LOS);
    const before = g.refs(0).slice();
    src.set(0, { x: centre(14), y: centre(9), owner: 0, typeId: 1 });
    g.update(src.latest(), LOS);
    expect(g.refs(0)).not.toEqual(before);
    src.set(0, { x: centre(10), y: centre(10), owner: 0, typeId: 1 });
    g.update(src.latest(), LOS);
    expect(g.refs(0)).toEqual(before);
  });
  it('a moving unit explores and never un-explores', () => {
    const W = 40;
    const g = new VisionGrid(W, W, 1, 2);
    const src = new FakeSnapshotSource(2, W, W);
    let prev = new Uint8Array(W * W);
    for (let x = 5; x < 35; x++) {
      src.set(0, { x: centre(x), y: centre(20), owner: 0, typeId: 1 });
      g.update(src.latest(), LOS);
      const e = g.explored(0);
      for (let i = 0; i < e.length; i++) expect(e[i] ?? 0).toBeGreaterThanOrEqual(prev[i] ?? 0);
      prev = e.slice();
    }
    // Tile the unit left long ago is explored but not visible.
    const out = new Uint8Array(W * W);
    g.viewFor(1, out);
    expect(out[20 * W + 5]).toBe(FOG_EXPLORED);
    expect(out[20 * W + 34]).toBe(FOG_VISIBLE);
    expect(out[0]).toBe(FOG_UNEXPLORED);
  });
  it('death subtracts the disc; explored survives', () => {
    const W = 16;
    const g = new VisionGrid(W, W, 1, 2);
    const src = new FakeSnapshotSource(2, W, W);
    src.set(0, { x: centre(8), y: centre(8), owner: 0, typeId: 1 });
    g.update(src.latest(), LOS);
    src.kill(0);
    expect(g.update(src.latest(), LOS)).toBe(true);
    expect(g.refs(0).every((v) => v === 0)).toBe(true);
    expect(g.explored(0)[8 * W + 8]).toBe(1);
    // respawn at the same slot works
    src.set(0, { x: centre(2), y: centre(2), owner: 0, typeId: 1 });
    g.update(src.latest(), LOS);
    expect(g.refs(0)[2 * W + 2]).toBe(1);
  });
  it('owner change and radius change move the contribution', () => {
    const W = 16;
    const g = new VisionGrid(W, W, 2, 2);
    const src = new FakeSnapshotSource(2, W, W);
    src.set(0, { x: centre(8), y: centre(8), owner: 0, typeId: 1 });
    g.update(src.latest(), LOS);
    src.set(0, { x: centre(8), y: centre(8), owner: 1, typeId: 3 });
    g.update(src.latest(), LOS);
    expect(g.refs(0).every((v) => v === 0)).toBe(true);
    let n = 0;
    for (const v of g.refs(1)) n += v;
    expect(n).toBe(13);
  });
  it('neutral, vision-less types and out-of-range owners contribute nothing', () => {
    const W = 16;
    const g = new VisionGrid(W, W, 2, 4);
    const src = new FakeSnapshotSource(4, W, W);
    src.set(0, { x: centre(8), y: centre(8), owner: 255, typeId: 1 });
    src.set(1, { x: centre(8), y: centre(8), owner: 0, typeId: 0 });
    src.set(2, { x: centre(8), y: centre(8), owner: 7, typeId: 1 });
    expect(g.update(src.latest(), LOS)).toBe(false);
    expect(g.refs(0).every((v) => v === 0)).toBe(true);
  });
});

describe('VisionGrid allies (union on query)', () => {
  it('viewFor unions refs and explored of the masked players only', () => {
    const W = 32;
    const g = new VisionGrid(W, W, 3, 4);
    const src = new FakeSnapshotSource(4, W, W);
    src.set(0, { x: centre(4), y: centre(4), owner: 0, typeId: 1 });
    src.set(1, { x: centre(24), y: centre(24), owner: 1, typeId: 1 });
    src.set(2, { x: centre(4), y: centre(24), owner: 2, typeId: 1 });
    g.update(src.latest(), LOS);
    const solo = new Uint8Array(W * W);
    const duo = new Uint8Array(W * W);
    g.viewFor(0b001, solo);
    g.viewFor(0b011, duo);
    expect(solo[4 * W + 4]).toBe(FOG_VISIBLE);
    expect(solo[24 * W + 24]).toBe(FOG_UNEXPLORED);
    expect(duo[24 * W + 24]).toBe(FOG_VISIBLE);
    expect(duo[24 * W + 4]).toBe(FOG_UNEXPLORED); // player 2 is not an ally
    // ally moves away: its old area is explored for the union, visible nowhere
    src.set(1, { x: centre(28), y: centre(10), owner: 1, typeId: 1 });
    g.update(src.latest(), LOS);
    g.viewFor(0b011, duo);
    expect(duo[24 * W + 24]).toBe(FOG_EXPLORED);
    expect(duo[10 * W + 28]).toBe(FOG_VISIBLE);
    // stored per-player state is untouched by the union
    expect(g.refs(0)[10 * W + 28]).toBe(0);
  });
  it('viewFor is the max of per-player states (visible beats explored)', () => {
    const W = 16;
    const g = new VisionGrid(W, W, 2, 2);
    const src = new FakeSnapshotSource(2, W, W);
    src.set(0, { x: centre(8), y: centre(8), owner: 0, typeId: 1 });
    g.update(src.latest(), LOS);
    src.set(0, { x: centre(1), y: centre(1), owner: 0, typeId: 1 }); // player 0 leaves (8,8) explored
    src.set(1, { x: centre(8), y: centre(8), owner: 1, typeId: 1 }); // player 1 sees it
    g.update(src.latest(), LOS);
    const out = new Uint8Array(W * W);
    g.viewFor(0b01, out);
    expect(out[8 * W + 8]).toBe(FOG_EXPLORED);
    g.viewFor(0b11, out);
    expect(out[8 * W + 8]).toBe(FOG_VISIBLE);
  });
});

describe('VisionGrid property: incremental == full recomputation', () => {
  for (const seed of [1, 2, 3, 0xdeadbeef]) {
    it(`1000 random steps, seed ${seed}`, () => {
      const W = 37; // non-square on purpose
      const H = 29;
      const P = 3;
      const CAP = 40;
      const prng = createPrng(seed);
      const g = new VisionGrid(W, H, P, CAP);
      const src = new FakeSnapshotSource(CAP, W, H);
      const alive = new Array<boolean>(CAP).fill(false);
      const exploredSeen = Array.from({ length: P }, () => new Uint8Array(W * H));
      for (let step = 0; step < 1000; step++) {
        const n = 1 + prng.nextInt(6);
        for (let k = 0; k < n; k++) {
          const slot = prng.nextInt(CAP);
          const roll = prng.nextInt(10);
          if (roll < 2 && alive[slot]) {
            src.kill(slot);
            alive[slot] = false;
          } else {
            const u: FakeUnit = {
              // include out-of-map and fractional positions to exercise clamping
              x: prng.nextInt((W + 2) * FX),
              y: prng.nextInt((H + 2) * FX),
              owner: roll === 9 ? 255 : prng.nextInt(P + 1),
              typeId: prng.nextInt(4),
            };
            src.set(slot, u);
            alive[slot] = true;
          }
        }
        g.update(src.latest(), LOS);
        const ref = reference(src, W, H, P);
        for (let p = 0; p < P; p++) {
          const refs = g.refs(p);
          const e = g.explored(p);
          const seen = exploredSeen[p];
          let bad = -1;
          for (let i = 0; i < W * H && bad < 0; i++) {
            const want = ref[p]?.[i] ?? 0;
            if (refs[i] !== want) bad = i;
            else if (want > 0 && e[i] !== 1) bad = i;
            else if ((e[i] ?? 0) < (seen?.[i] ?? 0)) bad = i; // monotonic
          }
          if (bad >= 0) expect.fail(`step ${step} player ${p} tile ${bad} diverges`);
          seen?.set(e);
        }
      }
    });
  }
  it('no float ever lands in the typed arrays (all counts are integers < 2^16)', () => {
    const g = new VisionGrid(8, 8, 1, 1);
    expect(g.refs(0)).toBeInstanceOf(Uint16Array);
    expect(g.explored(0)).toBeInstanceOf(Uint8Array);
  });
});

describe('VisionGrid performance (Node)', () => {
  it('update with 400 units: steady state is ≤ 1 ms, per-frame movement of 400 units is bounded', () => {
    const W = 128;
    const CAP = 512;
    const g = new VisionGrid(W, W, 2, CAP);
    const src = new FakeSnapshotSource(CAP, W, W);
    const prng = createPrng(7);
    for (let s = 0; s < 400; s++)
      src.set(s, {
        x: prng.nextInt(W * FX),
        y: prng.nextInt(W * FX),
        owner: s & 1,
        typeId: 1,
      });
    g.update(src.latest(), LOS);
    // warm-up
    for (let i = 0; i < 50; i++) g.update(src.latest(), LOS);
    const view = src.latest();
    const times: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      g.update(view, LOS);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
    console.log('visionGrid steady update p95 ms', p95.toFixed(4));
    expect(p95).toBeLessThanOrEqual(1);

    // Worst case: every unit changes tile this frame (disc remove + add for 400 units).
    const moved: number[] = [];
    for (let i = 0; i < 20; i++) {
      for (let s = 0; s < 400; s++)
        src.set(s, {
          x: prng.nextInt(W * FX),
          y: prng.nextInt(W * FX),
          owner: s & 1,
          typeId: 1,
        });
      const v = src.latest();
      const t0 = performance.now();
      g.update(v, LOS);
      moved.push(performance.now() - t0);
    }
    moved.sort((a, b) => a - b);
    console.log('visionGrid all-400-move update median ms', (moved[10] ?? 0).toFixed(3));
    expect(moved[10] ?? 0).toBeLessThan(10);
  });
});
