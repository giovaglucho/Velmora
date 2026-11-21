// FNV-1a over the renderable columns of a snapshot: lets a browser run and a Node run prove they hold
// the same state at the same tick without shipping the arrays (used by e2e/render/worker.spec.ts).
import type { SnapshotView } from './snapshot';

export function snapshotChecksum(v: SnapshotView): number {
  let h = 0x811c9dc5;
  const mix = (x: number): void => {
    h = Math.imul(h ^ (x & 0xffff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((x >>> 16) & 0xffff), 0x01000193) >>> 0;
  };
  mix(v.tick);
  mix(v.highWater);
  mix(v.count);
  for (let i = 0; i < v.highWater; i++) {
    mix(v.posX[i] as number);
    mix(v.posY[i] as number);
    mix(v.prevX[i] as number);
    mix(v.prevY[i] as number);
    mix(v.hp[i] as number);
    mix(((v.gen[i] as number) << 16) | (v.typeId[i] as number));
    mix(((v.facing[i] as number) << 16) | ((v.owner[i] as number) << 8) | (v.flags[i] as number));
  }
  return h >>> 0;
}
