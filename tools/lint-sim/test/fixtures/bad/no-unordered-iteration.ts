const m = new Map<number, number>();
const s = new Set<number>();
export function a(): number {
  let t = 0;
  for (const [k] of m) t += k; // expect-violation: no-unordered-iteration
  for (const v of s) t += v; // expect-violation: no-unordered-iteration
  for (const k of m.keys()) t += k; // expect-violation: no-unordered-iteration
  m.forEach((v) => { // expect-violation: no-unordered-iteration
    t += v;
  });
  const arr = [...s]; // expect-violation: no-unordered-iteration
  const arr2 = Array.from(m.values()); // expect-violation: no-unordered-iteration
  const ent = m.entries(); // expect-violation: no-unordered-iteration
  return t + arr.length + arr2.length + (ent ? 1 : 0);
}
