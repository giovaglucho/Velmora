const m = new Map<number, number>();
const s = new Set<number>();
export function a(): number {
  let t = 0;
  for (const k of [...m.keys()].sort((x, y) => x - y)) t += k;
  for (const v of [...s].sort((x, y) => x - y)) t += v;
  const arr2 = Array.from(m.values()).sort((x, y) => x - y);
  const plain = [3, 1, 2];
  for (const p of plain) t += p;
  plain.forEach((p) => { t += p; });
  t += m.size + s.size + (m.get(1) ?? 0) + (s.has(1) ? 1 : 0);
  return t + arr2.length;
}
