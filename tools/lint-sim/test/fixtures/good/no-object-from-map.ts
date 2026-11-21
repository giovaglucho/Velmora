const m = new Map<string, number>();
export const a = Object.fromEntries([...m.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
export const b = Object.entries({ x: 1, y: 2 });
export const c = Object.keys({ x: 1 });
export const d = m.size;
