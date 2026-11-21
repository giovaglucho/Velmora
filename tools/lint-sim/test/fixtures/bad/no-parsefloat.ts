export const a = (s: string): number => parseFloat(s); // expect-violation: no-parsefloat
export const b = (s: string): number => Number.parseFloat(s); // expect-violation: no-parsefloat
