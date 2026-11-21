import { describe, expect, it } from 'vitest';
import { createPrng, createPrngFromState, hashBytes, hashInts } from '../src/index';

describe('hash FNV-1a', () => {
  it('vectores de referencia conocidos', () => {
    const b = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
    expect(hashBytes([])).toBe(0x811c9dc5);
    expect(hashBytes(b('a'))).toBe(0xe40c292c);
    expect(hashBytes(b('foobar'))).toBe(0xbf9cf968);
  });
  it('hashInts equivale a hashBytes little-endian', () => {
    expect(hashInts([0x04030201])).toBe(hashBytes([1, 2, 3, 4]));
    expect(hashInts([-1])).toBe(hashBytes([255, 255, 255, 255]));
  });
  it('es sensible al orden', () => {
    expect(hashInts([1, 2])).not.toBe(hashInts([2, 1]));
  });
});

describe('xoshiro128**', () => {
  it('coincide con el vector de referencia oficial (estado 1,2,3,4)', () => {
    const r = createPrngFromState([1, 2, 3, 4]);
    expect([r.nextU32(), r.nextU32(), r.nextU32(), r.nextU32()]).toEqual([
      11520, 0, 5927040, 70819200,
    ]);
  });
  it('determinista por semilla y restaurable desde el estado', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
    const c = createPrngFromState(a.getState());
    for (let i = 0; i < 100; i++) expect(c.nextU32()).toBe(a.nextU32());
  });
  it('nextInt respeta el rango y rechaza bounds invalidos', () => {
    const r = createPrng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.nextInt(10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(1.5)).toThrow(RangeError);
  });
});
