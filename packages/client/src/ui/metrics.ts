// ADR-006 §8.1 — React render counter (`reactRendersPerSec`, budget ≤ 10/s). Fed by <Profiler> in App.
// Time is passed in by the caller of `reactRendersPerSec`, so this module is deterministic in tests.
const stamps: number[] = [];
let total = 0;

export function recordReactRender(nowMs: number): void {
  total++;
  stamps.push(nowMs);
  while (stamps.length > 0 && (stamps[0] ?? 0) < nowMs - 5000) stamps.shift();
}

/** Renders per second averaged over the last `windowMs` (default 1000). */
export function reactRendersPerSec(nowMs: number, windowMs = 1000): number {
  let n = 0;
  for (let i = stamps.length - 1; i >= 0 && (stamps[i] ?? 0) >= nowMs - windowMs; i--) n++;
  return (n * 1000) / windowMs;
}

export function totalReactRenders(): number {
  return total;
}

export function resetReactMetrics(): void {
  stamps.length = 0;
  total = 0;
}
