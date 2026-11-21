import type { MovementFactory } from '../systems';
import { createMovementSystemWith } from './steer';

export { createMovementSystemWith, type MovementOptions, type MovementSystemImpl } from './steer';

/** Default movement system of createSim (ADR-005 §8, §10). */
export const createMovementSystem: MovementFactory = (w, grid, data) =>
  createMovementSystemWith(w, grid, data);
