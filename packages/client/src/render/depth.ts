// ADR-006 §4.4 — depth key. PURE. Owner: render-engineer (R1).
/** Buckets of 1/8 tile in x+y (>> 7 on Fx) and the per-slot tie-break span. */
const DEPTH_SHIFT = 7;
const SLOT_SPAN = 4096;
const ELEV_DEPTH = 8 * SLOT_SPAN;

/** ((fxX + fxY) >> 7) * 4096 + (slot & 4095) (+ h * 8 * 4096 with elevation). Integer inputs. */
export function depthKey(fxX: number, fxY: number, slot: number, h = 0): number {
  return (
    (((fxX | 0) + (fxY | 0)) >> DEPTH_SHIFT) * SLOT_SPAN + (slot & (SLOT_SPAN - 1)) + h * ELEV_DEPTH
  );
}
