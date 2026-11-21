export const a = new Float32Array(4); // expect-violation: no-float-array
export const b = new Float64Array(4); // expect-violation: no-float-array
export const c = (d: DataView): number => d.getFloat64(0); // expect-violation: no-float-array
