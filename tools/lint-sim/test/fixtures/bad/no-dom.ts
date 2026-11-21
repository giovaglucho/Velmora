import { createRoot } from "react-dom/client";
import * as PIXI from "pixi.js";
export const a = (): unknown => [createRoot, PIXI];
export const b = (): unknown => document.body;
export const c = (): unknown => window.innerWidth;
