import { readFileSync } from 'node:fs';
export const a = { document: 1, window: 2 };
export const b = a.document + a.window;
export const c = readFileSync;
