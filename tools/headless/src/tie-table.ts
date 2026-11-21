// Synthetic balance tables whose unit speeds land exactly on x.5 ties of
// speed * fixedScale / TICKS_PER_SECOND (R1/F1 H4). Shared by the Node spec and the browser bundle
// so that both sides build the very same inputs from integers.
import type { RawGameData } from '@reinos/data';

/** Number of distinct tie speeds per table (speed = (2k + 1) / 100 tiles/s -> x.5 fx/tick at scale 1000). */
export const TIE_SPEED_COUNT = 400;

/** The k-th synthetic speed in tiles/s: (2k + 1) / 100, derived from integers only. */
export function tieSpeed(k: number): number {
  return (2 * k + 1) / 100;
}

/**
 * Deep copy of `raw` in which unit i of table `round` gets speed tieSpeed(round * units + i
 * mod TIE_SPEED_COUNT), plus one-ulp neighbours for odd units (just below / above the tie).
 */
export function withTieSpeeds(raw: RawGameData, round: number): RawGameData {
  const out = structuredClone(raw) as RawGameData;
  const file = out.units as { units: { speed: number }[] };
  const n = file.units.length;
  for (let i = 0; i < n; i++) {
    const u = file.units[i] as { speed: number };
    const base = tieSpeed((round * n + i) % TIE_SPEED_COUNT);
    // nudge by a relative 2^-52 step down/up for a third of the units: the near-tie neighbours
    const nudge = i % 3 === 1 ? 1 - Number.EPSILON : i % 3 === 2 ? 1 + Number.EPSILON : 1;
    u.speed = base * nudge;
  }
  return out;
}
