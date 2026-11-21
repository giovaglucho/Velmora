export const a = (): number => globalThis.Date.now(); // expect-violation: no-time
export const b = (): object => new globalThis.Date(); // expect-violation: no-time
export const c = (): number => globalThis.Math.random(); // expect-violation: no-math-random
export const d = (): number => globalThis.Math.sin(1); // expect-violation: no-math
export function e(): void {
  globalThis.setTimeout(() => undefined, 10); // expect-violation: no-timers
}
export const f = (): number => globalThis.performance.now(); // expect-violation: no-time
export const g = (a: Uint32Array): Uint32Array => globalThis.crypto.getRandomValues(a); // expect-violation: no-crypto
const h = globalThis; // expect-violation: no-global-alias
export const i = h;
