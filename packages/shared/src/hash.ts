// FNV-1a de 32 bits sobre enteros. Sin floats.

export const FNV_OFFSET_BASIS = 0x811c9dc5;
export const FNV_PRIME = 0x01000193;

/** Incorpora un byte (0..255) al hash. */
export function fnv1aByte(h: number, byte: number): number {
  return Math.imul((h ^ (byte & 0xff)) >>> 0, FNV_PRIME) >>> 0;
}

/** Incorpora un entero de 32 bits (little-endian, 4 bytes) al hash. */
export function fnv1aInt32(h: number, value: number): number {
  let x = h;
  x = fnv1aByte(x, value);
  x = fnv1aByte(x, value >>> 8);
  x = fnv1aByte(x, value >>> 16);
  x = fnv1aByte(x, value >>> 24);
  return x;
}

/** Hash FNV-1a (uint32) de una secuencia de enteros de 32 bits. */
export function hashInts(values: Iterable<number>): number {
  let h = FNV_OFFSET_BASIS;
  for (const v of values) h = fnv1aInt32(h, v);
  return h >>> 0;
}

/** Hash FNV-1a (uint32) de bytes. */
export function hashBytes(bytes: ArrayLike<number>): number {
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < bytes.length; i++) h = fnv1aByte(h, bytes[i] as number);
  return h >>> 0;
}
