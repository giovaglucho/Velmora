// ADR-006 §5–6 — presentation constants of the input layer (NOT balance: balance lives in packages/data).
// Gesture thresholds fixed by the ADR; hit-test shape is a presentation choice of the picking contract.

/** A pointer drag shorter than this (screen px, both axes) is a click, not a box (ADR-006 §5). */
export const CLICK_THRESHOLD_PX = 4;
/** Two clicks on the same unit within this many ms select every same-type unit on screen. */
export const DOUBLE_CLICK_MS = 300;
/** Pressing the same control-group digit twice within this many ms centres the camera (ADR-006 §6). */
export const DOUBLE_PRESS_MS = 300;
/** Minimum hit ellipse semi-axis in px at zoom 1 (0.5 × 64 px, ADR-006 §5). */
export const HIT_MIN_RX_PX = 32;
/** Hit ellipse is taller than wide to cover the torso: ry = rx × this (ADR-006 §5). */
export const HIT_RY_OVER_RX = 1.5;
/** Wheel delta accumulated before the zoom level changes by one step (trackpads emit many small deltas). */
export const WHEEL_STEP_DELTA = 100;
/** Number of control groups (digits 0–9). */
export const CONTROL_GROUP_COUNT = 10;
