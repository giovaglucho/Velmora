const M = Math; // expect-violation: no-math
const { random } = Math; // expect-violation: no-math
const G = globalThis.Math; // expect-violation: no-math
export const a = (): number => M.min(1, 2);
export const b = (): number => random();
export const c = (): number => G.max(1, 2);
