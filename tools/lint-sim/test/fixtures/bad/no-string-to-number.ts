export const a = Number('1.5'); // expect-violation: no-string-to-number
export const b = (s: string): number => +s; // expect-violation: no-string-to-number
export const c = (s: string): number => Number(s); // expect-violation: no-string-to-number
export const d = (x: unknown): number => Number(x); // expect-violation: no-string-to-number
