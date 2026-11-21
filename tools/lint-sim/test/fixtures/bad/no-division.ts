export const a = (x: number, y: number): number => x / y; // expect-violation: no-division
export function b(x: number): number {
  x /= 2; // expect-violation: no-division
  return x;
}
