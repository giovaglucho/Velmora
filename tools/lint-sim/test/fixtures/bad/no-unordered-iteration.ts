const m = new Map<number, number>();
const s = new Set<number>();
export function a(): number {
  let t = 0;
  for (const [k] of m) t += k;
  for (const v of s) t += v;
  for (const k of m.keys()) t += k;
  m.forEach((v) => { t += v; });
  const arr = [...s];
  const arr2 = Array.from(m.values());
  const ent = m.entries();
  return t + arr.length + arr2.length + (ent ? 1 : 0);
}
