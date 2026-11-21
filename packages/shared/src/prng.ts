// PRNG determinista xoshiro128** (32 bits, solo enteros). Sin floats ni Math.random.

export interface Prng {
  /** Siguiente uint32 en [0, 2^32). */
  nextU32(): number;
  /** Entero uniforme en [0, bound) (bound entero en 1..2^32). Usa rechazo para evitar sesgo. */
  nextInt(bound: number): number;
  /** Estado interno (4 x uint32) para snapshots. */
  getState(): [number, number, number, number];
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** splitmix32: expande una semilla uint32 en palabras de estado. */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createPrngFromState(state: readonly [number, number, number, number]): Prng {
  let s0 = state[0] >>> 0;
  let s1 = state[1] >>> 0;
  let s2 = state[2] >>> 0;
  let s3 = state[3] >>> 0;
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1; // el estado todo-ceros es invalido

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };

  const nextInt = (bound: number): number => {
    if (!Number.isInteger(bound) || bound < 1 || bound > 0x100000000)
      throw new RangeError('nextInt: bound invalido');
    if (bound === 0x100000000) return nextU32();
    // rechazo: descartamos la zona final que causaria sesgo de modulo
    const limit = 0x100000000 - (0x100000000 % bound);
    let r = nextU32();
    while (r >= limit) r = nextU32();
    return r % bound;
  };

  return { nextU32, nextInt, getState: () => [s0, s1, s2, s3] };
}

/** Crea un PRNG a partir de una semilla entera (uint32). */
export function createPrng(seed: number): Prng {
  const sm = splitmix32(seed);
  return createPrngFromState([sm(), sm(), sm(), sm()]);
}
