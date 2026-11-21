import { describe, expect, it } from 'vitest';
import { FogSystem } from '../../../src/render/fog/fogSystem';
import { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE } from '../../../src/render/fog/visionGrid';
import { FakeSnapshotSource } from './fakeSource';

const LOS = [0, 4];
const c = (t: number) => t * 1000 + 500;

function setup() {
  const sys = new FogSystem({
    width: 32,
    height: 32,
    maxPlayers: 3,
    capacity: 8,
    losTilesByType: LOS,
  });
  const src = new FakeSnapshotSource(8, 32, 32);
  sys.setLocalPlayer(0);
  return { sys, src };
}

describe('FogSystem', () => {
  it('update reports a change once, then stays quiet while nothing moves', () => {
    const { sys, src } = setup();
    src.set(0, { x: c(10), y: c(10), owner: 0, typeId: 1 });
    expect(sys.update(src.latest())).toBe(true);
    expect(sys.update(src.latest())).toBe(false);
    expect(sys.fogState(10, 10)).toBe(FOG_VISIBLE);
    expect(sys.fogState(20, 20)).toBe(FOG_UNEXPLORED);
    expect(sys.fogState(-1, 3)).toBe(FOG_UNEXPLORED);
    src.set(0, { x: c(25), y: c(10), owner: 0, typeId: 1 });
    expect(sys.update(src.latest())).toBe(true);
    expect(sys.fogState(10, 10)).toBe(FOG_EXPLORED);
  });
  it('enemies/neutrals draw only on VISIBLE tiles; own and allies always', () => {
    const { sys, src } = setup();
    src.set(0, { x: c(10), y: c(10), owner: 0, typeId: 1 });
    src.set(1, { x: c(11), y: c(10), owner: 1, typeId: 1 }); // enemy in sight
    src.set(2, { x: c(28), y: c(28), owner: 1, typeId: 1 }); // enemy far away
    src.set(3, { x: c(28), y: c(4), owner: 2, typeId: 0 }); // would-be ally far away
    src.set(4, { x: c(9), y: c(10), owner: 255, typeId: 0 }); // neutral in sight
    src.set(5, { x: c(28), y: c(10), owner: 255, typeId: 0 }); // neutral far away
    sys.update(src.latest());
    let v = src.latest();
    expect([0, 1, 2, 3, 4, 5].map((s) => sys.isSlotVisible(v, s))).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
    ]);
    sys.setLocalPlayer(0, 0b100); // player 2 becomes an ally
    expect(sys.update(src.latest())).toBe(true);
    v = src.latest();
    expect(sys.isSlotVisible(v, 3)).toBe(true);
    src.kill(1);
    sys.update(src.latest());
    expect(sys.isSlotVisible(src.latest(), 1)).toBe(false);
  });
  it('an ally contributes its vision to the local states', () => {
    const { sys, src } = setup();
    sys.setLocalPlayer(0, 0b010);
    src.set(0, { x: c(5), y: c(5), owner: 1, typeId: 1 });
    sys.update(src.latest());
    expect(sys.fogState(5, 5)).toBe(FOG_VISIBLE);
  });
});
