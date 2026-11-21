// Constants shared by the browser smoke page (smoke.ts) and its Node-side expectation
// (e2e/render/worker.spec.ts): paused steps, total turns compared, move target of player 0.
export const SMOKE_STEP_TURNS = 12;
export const SMOKE_TOTAL_TURNS = 30;
export const SMOKE_TARGET_TILE = { x: 100, y: 64 };
