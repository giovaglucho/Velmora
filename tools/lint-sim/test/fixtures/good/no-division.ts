export const a = (x: number, y: number): number => Math.trunc(x / y);
export const b = (x: number, y: number): number => (x / y) | 0;
export const c = (x: number, y: number): number => (x / y) >> 0;
export const d = (x: number, y: number): number => ~~(x / y);
export const e = (x: number): number => x % 3;
