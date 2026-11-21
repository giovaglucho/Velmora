export const a = (x: number): number => Math.sin(x); // expect-violation: no-math
export const b = (x: number): number => Math.sqrt(x); // expect-violation: no-math
export const c = (x: number): number => Math.pow(x, 2); // expect-violation: no-math
export const d = (x: number): number => Math.cos(x) + Math.tan(x); // expect-violation: no-math
export const e = Math.PI; // expect-violation: no-math
export const f = (x: number): number => Math.floor(x); // expect-violation: no-math
