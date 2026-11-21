export const a = (): number => Date.now(); // expect-violation: no-time
export const b = (): object => new Date(); // expect-violation: no-time
export const c = (): number => performance.now(); // expect-violation: no-time
