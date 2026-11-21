export const a = (x: number, y: number): number => Math.min(x, y);
const lo = Math.min;
export const b = (x: number, y: number): number => lo(x, y);
const { trunc } = { trunc: (x: number) => x };
export const c = trunc(3);
