const m = new Map<string, number>();
export const a = Object.fromEntries(m); // expect-violation: no-unordered-iteration
export const b = Object.fromEntries(m.entries()); // expect-violation: no-unordered-iteration
export const c = Object.entries(m); // expect-violation: no-unordered-iteration
export const d = Object.fromEntries(new Set<[string, number]>()); // expect-violation: no-unordered-iteration
