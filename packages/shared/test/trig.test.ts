import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANGLE_STEPS,
  ATAN_OCTANT,
  SIN_QUARTER,
  TRIG_ONE,
  atan2Idx,
  cosT,
  createPrng,
  hashInts,
  mulTrig,
  sinT,
} from '../src/index';

// Pinned FNV-1a hashes of the committed tables. Changing a table breaks replay compatibility:
// bump REPLAY_FORMAT_VERSION, amend ADR-005 and re-pin these (and the golden replay hashes).
// Computed with an independent Python FNV-1a over the little-endian int32 stream.
const SIN_QUARTER_HASH = 0x776254e3;
const ATAN_OCTANT_HASH = 0xc02d19d7;
const COMBINED_HASH = 0x1ee20c51;

describe('trig tables', () => {
  it('have 257 entries, are monotonic and hit exact anchors', () => {
    expect(SIN_QUARTER.length).toBe(257);
    expect(ATAN_OCTANT.length).toBe(257);
    expect(SIN_QUARTER[0]).toBe(0);
    expect(SIN_QUARTER[256]).toBe(TRIG_ONE);
    expect(ATAN_OCTANT[0]).toBe(0);
    expect(ATAN_OCTANT[256]).toBe(128);
    for (let i = 1; i <= 256; i++) {
      expect(SIN_QUARTER[i]!).toBeGreaterThanOrEqual(SIN_QUARTER[i - 1]!);
      expect(ATAN_OCTANT[i]!).toBeGreaterThanOrEqual(ATAN_OCTANT[i - 1]!);
    }
  });
  it('match the reference formula (Math.sin/Math.atan allowed in tests only)', () => {
    for (let i = 0; i <= 256; i++) {
      expect(SIN_QUARTER[i]).toBe(Math.round(TRIG_ONE * Math.sin((i * 2 * Math.PI) / ANGLE_STEPS)));
      expect(ATAN_OCTANT[i]).toBe(Math.round((ANGLE_STEPS / (2 * Math.PI)) * Math.atan(i / 256)));
    }
  });
  it('have pinned hashes', () => {
    expect(hashInts(SIN_QUARTER)).toBe(SIN_QUARTER_HASH);
    expect(hashInts(ATAN_OCTANT)).toBe(ATAN_OCTANT_HASH);
    expect(hashInts([...SIN_QUARTER, ...ATAN_OCTANT])).toBe(COMBINED_HASH);
  });
  it('are reproduced byte for byte by tools/gen-trig.mjs (no diff)', () => {
    const script = join(__dirname, '../../../tools/gen-trig.mjs');
    const out = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    expect(out).toContain('up to date');
  });
});

describe('sinT / cosT', () => {
  it('exact anchors', () => {
    expect(sinT(0)).toBe(0);
    expect(sinT(256)).toBe(16384);
    expect(sinT(512)).toBe(0);
    expect(sinT(768)).toBe(-16384);
    expect(cosT(0)).toBe(16384);
    expect(cosT(256)).toBe(0);
    expect(cosT(512)).toBe(-16384);
    expect(cosT(768)).toBe(0);
    expect(Object.is(sinT(512), 0)).toBe(true);
  });
  it('within 1 of round(16384*sin) for all 1024 angles, and cos = sin(a+256)', () => {
    for (let a = 0; a < ANGLE_STEPS; a++) {
      const ref = Math.sin((2 * Math.PI * a) / ANGLE_STEPS) * TRIG_ONE;
      expect(Math.abs(sinT(a) - ref)).toBeLessThanOrEqual(1);
      const refC = Math.cos((2 * Math.PI * a) / ANGLE_STEPS) * TRIG_ONE;
      expect(Math.abs(cosT(a) - refC)).toBeLessThanOrEqual(1);
      expect(cosT(a)).toBe(sinT(a + 256));
      const sq = sinT(a) * sinT(a) + cosT(a) * cosT(a);
      expect(Math.abs(sq - TRIG_ONE * TRIG_ONE)).toBeLessThanOrEqual(2 * TRIG_ONE);
      expect(Math.abs(sinT(a))).toBeLessThanOrEqual(TRIG_ONE);
    }
  });
  it('quadrant symmetries are exact', () => {
    for (let a = 0; a < 256; a++) {
      expect(sinT(a + 256)).toBe(sinT(256 - a));
      expect(sinT(a + 512)).toBe(-sinT(a) + 0);
      expect(sinT(a + 768)).toBe(-sinT(256 - a) + 0);
      expect(sinT(-a)).toBe(-sinT(a) + 0);
    }
  });
  it('masks any integer angle', () => {
    for (const a of [0, 1, 255, 1023]) {
      expect(sinT(a + 1024)).toBe(sinT(a));
      expect(sinT(a - 1024)).toBe(sinT(a));
      expect(sinT(a + 1024 * 1000)).toBe(sinT(a));
      expect(sinT(a - 1024 * 1000)).toBe(sinT(a));
    }
  });
});

describe('mulTrig', () => {
  it('truncates toward zero and matches BigInt', () => {
    expect(mulTrig(1000, TRIG_ONE)).toBe(1000);
    expect(mulTrig(-1000, TRIG_ONE)).toBe(-1000);
    expect(mulTrig(1000, 8192)).toBe(500);
    expect(mulTrig(-3, 8192)).toBe(-1); // -1.5 -> -1
    expect(mulTrig(3, -8192)).toBe(-1);
    expect(Object.is(mulTrig(-1, 1), 0)).toBe(true);
    const rng = createPrng(7);
    for (let i = 0; i < 100_000; i++) {
      const v = rng.nextInt(2 ** 21) - 2 ** 20;
      const t = rng.nextInt(2 * TRIG_ONE + 1) - TRIG_ONE;
      expect(mulTrig(v, t)).toBe(Number((BigInt(v) * BigInt(t)) / BigInt(TRIG_ONE)));
    }
  });
});

describe('atan2Idx', () => {
  it('exact on the 8 axes/diagonals; (0,0) -> 0', () => {
    expect(atan2Idx(0, 0)).toBe(0);
    const k = 1000;
    expect(atan2Idx(0, k)).toBe(0); // east
    expect(atan2Idx(k, k)).toBe(128); // south-east
    expect(atan2Idx(k, 0)).toBe(256); // south (+y)
    expect(atan2Idx(k, -k)).toBe(384);
    expect(atan2Idx(0, -k)).toBe(512); // west
    expect(atan2Idx(-k, -k)).toBe(640);
    expect(atan2Idx(-k, 0)).toBe(768); // north
    expect(atan2Idx(-k, k)).toBe(896);
  });
  it('is within 1 step of the real angle on 10^5 random pairs and in range', () => {
    const rng = createPrng(99);
    let worst = 0;
    for (let i = 0; i < 100_000; i++) {
      const mag = 1 + rng.nextInt(2 ** 25);
      const dx = rng.nextInt(2 * mag + 1) - mag;
      const dy = rng.nextInt(2 * mag + 1) - mag;
      const got = atan2Idx(dy, dx);
      expect(got).toBeGreaterThanOrEqual(0);
      expect(got).toBeLessThan(ANGLE_STEPS);
      if (dx === 0 && dy === 0) continue;
      let ref = (Math.atan2(dy, dx) * ANGLE_STEPS) / (2 * Math.PI);
      if (ref < 0) ref += ANGLE_STEPS;
      let d = Math.abs(got - ref);
      d = Math.min(d, ANGLE_STEPS - d);
      worst = Math.max(worst, d);
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
  it('is consistent with sinT/cosT (round trip within 2 steps)', () => {
    for (let a = 0; a < ANGLE_STEPS; a++) {
      const back = atan2Idx(sinT(a), cosT(a));
      const d = Math.abs(back - a);
      expect(Math.min(d, ANGLE_STEPS - d)).toBeLessThanOrEqual(2);
    }
  });
});
