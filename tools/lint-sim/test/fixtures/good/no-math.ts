export const a = (x: number, y: number): number => Math.min(x, y) + Math.max(x, y) + Math.abs(x);
export const b = (x: number): number =>
  Math.trunc(x) + Math.sign(x) + Math.clz32(x) + Math.imul(x, 3);
