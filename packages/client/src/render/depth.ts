// ADR-006 §4.4 — depth key. PURE. Owner: render-engineer (R1).
/** ((fxX + fxY) >> 7) * 4096 + (slot & 4095) (+ h * 8 * 4096 with elevation). Integer inputs. */
export function depthKey(_fxX: number, _fxY: number, _slot: number, _h?: number): number {
  throw new Error('TODO(R1): depthKey');
}
