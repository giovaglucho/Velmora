import { randomBytes } from 'node:crypto'; // expect-violation: no-crypto
export const a = (): string => crypto.randomUUID(); // expect-violation: no-crypto
export const b = (x: Uint32Array): Uint32Array => crypto.getRandomValues(x); // expect-violation: no-crypto
export const c = randomBytes;
