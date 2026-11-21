import { describe, expect, it } from 'vitest';
import { createPrng, hashInts } from '@reinos/shared';

// Fase 0: placeholder real. La Fase 1 lo ampliara con el hash del estado de la sim por tick.
const SEED = 0xc0ffee;
const COUNT = 1000;
const EXPECTED_HASH = 0xcb6be2e0; // FNV-1a de 1000 u32 de xoshiro128** (semilla 0xc0ffee); verificado contra implementacion de referencia independiente (Python)

function sequence(seed: number): number[] {
  const rng = createPrng(seed);
  const out: number[] = [];
  for (let i = 0; i < COUNT; i++) out.push(rng.nextU32());
  return out;
}

describe('determinismo (placeholder Fase 0)', () => {
  it('la secuencia xoshiro128** con semilla fija produce el hash esperado', () => {
    expect(hashInts(sequence(SEED))).toBe(EXPECTED_HASH);
  });
  it('misma semilla, mismo hash; otra semilla, otro hash', () => {
    expect(hashInts(sequence(SEED))).toBe(hashInts(sequence(SEED)));
    expect(hashInts(sequence(SEED + 1))).not.toBe(hashInts(sequence(SEED)));
  });
});
