import { describe, expect, it } from 'vitest';
import { MARKER_DURATION_MS, animFrame, markerAnim, unitDir } from '../../src/render/entities/anim';
import {
  dirScreenVec,
  generateUnitFrame,
  FRAME_H,
  FRAME_W,
} from '../../src/render/entities/procSprites';

describe('sprite helpers (ADR-006 §4.7)', () => {
  it('unitDir quantises facing 0..1023 into dirs sectors centred on multiples', () => {
    expect(unitDir(0, 8)).toBe(0);
    expect(unitDir(63, 8)).toBe(0);
    expect(unitDir(64, 8)).toBe(1); // (64*8+512)>>10 = 1
    expect(unitDir(128, 8)).toBe(1);
    expect(unitDir(512, 8)).toBe(4);
    expect(unitDir(1023, 8)).toBe(0); // wraps
    expect(unitDir(1000, 16)).toBe(0);
    const seen = new Set<number>();
    for (let f = 0; f < 1024; f++) seen.add(unitDir(f, 8));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it('animFrame: 0 idle, walk cycles 1..4 each 2 ticks, offset by slot', () => {
    expect(animFrame(10, 3, false)).toBe(0);
    const f = [0, 2, 4, 6].map((t) => animFrame(t, 0, true));
    expect(f).toEqual([1, 2, 3, 4]);
    expect(animFrame(0, 0, true)).toBe(animFrame(1, 0, true));
    expect(animFrame(0, 1, true)).toBe(2);
    expect(animFrame(8, 0, true)).toBe(1);
  });
  it('markerAnim expands and fades over 600 ms', () => {
    const a = markerAnim(0);
    expect(a.alpha).toBe(1);
    expect(a.scale).toBeCloseTo(0.4, 9);
    const b = markerAnim(MARKER_DURATION_MS);
    expect(b.alpha).toBe(0);
    expect(b.scale).toBeCloseTo(1.2, 9);
    const m = markerAnim(300);
    expect(m.alpha).toBeCloseTo(0.5, 9);
    expect(m.scale).toBeGreaterThan(0.4);
    expect(markerAnim(10_000).alpha).toBe(0);
  });
});

describe('provisional unit frames', () => {
  it('direction convention: dir 0 points down-right (+x grid), dir 2 down-left (+y grid)', () => {
    expect(dirScreenVec(0, 8).x).toBeGreaterThan(0.8);
    expect(dirScreenVec(0, 8).y).toBeGreaterThan(0);
    expect(dirScreenVec(2, 8).x).toBeLessThan(-0.5);
    expect(dirScreenVec(2, 8).y).toBeGreaterThan(0);
    expect(dirScreenVec(4, 8).x).toBeLessThan(-0.8);
    expect(dirScreenVec(6, 8).y).toBeLessThan(0);
  });
  it('frames have opaque body pixels, a team mask inside the body, and differ per direction', () => {
    const f0 = generateUnitFrame(0, 8, 0);
    const f4 = generateUnitFrame(4, 8, 0);
    expect(f0.body.length).toBe(FRAME_W * FRAME_H * 4);
    let bodyPx = 0;
    let teamPx = 0;
    for (let i = 3; i < f0.body.length; i += 4) {
      if ((f0.body[i] ?? 0) > 200) bodyPx++;
      if ((f0.team[i] ?? 0) > 200) {
        teamPx++;
        expect(f0.body[i]).toBeGreaterThan(200); // team mask only where the body is opaque
      }
    }
    expect(bodyPx).toBeGreaterThan(500);
    expect(teamPx).toBeGreaterThan(50);
    expect(f0.body).not.toEqual(f4.body);
    // walk frames bob
    expect(generateUnitFrame(0, 8, 2).body).not.toEqual(f0.body);
  });
});
