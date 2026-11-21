import { createRoot } from 'react-dom/client'; // expect-violation: no-dom
import * as PIXI from 'pixi.js'; // expect-violation: no-dom
export const a = (): unknown => [createRoot, PIXI];
export const b = (): unknown => document.body; // expect-violation: no-dom
export const c = (): unknown => window.innerWidth; // expect-violation: no-dom
export const d = (): unknown => globalThis.navigator; // expect-violation: no-dom
