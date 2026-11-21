export const a = (s: string): unknown => JSON.parse(s); // expect-violation: no-json-parse
export const b = (): unknown => globalThis.JSON.parse('1'); // expect-violation: no-json-parse
