// ADR-006 §3.7 / §4.7 / §6 — pure sprite helpers (direction, animation frame, marker animation). Owner: render-engineer (R3).

/** `dir = (((facing * dirs) + 512) >> 10) % dirs` (facing 0..1023). */
export function unitDir(facing: number, dirs: number): number {
  return ((((facing * dirs + 512) >> 10) % dirs) + dirs) % dirs;
}
/** 0 = idle; 1..4 = walk cycle: `((tick >> 1) + slot) & 3` + 1 while moving. */
export function animFrame(tick: number, slot: number, moving: boolean): number {
  return moving ? (((tick >> 1) + slot) & 3) + 1 : 0;
}

export const MARKER_DURATION_MS = 600;
export const MARKER_POOL = 8;

/** Expanding ring: scale 0.4 → 1.2 (ease-out), alpha 1 → 0. `ageMs` ≥ duration ⇒ finished (alpha 0). */
export function markerAnim(
  ageMs: number,
  durationMs: number = MARKER_DURATION_MS,
): { scale: number; alpha: number } {
  const t = durationMs > 0 ? Math.min(Math.max(ageMs / durationMs, 0), 1) : 1;
  const e = 1 - (1 - t) * (1 - t);
  return { scale: 0.4 + 0.8 * e, alpha: 1 - t };
}
