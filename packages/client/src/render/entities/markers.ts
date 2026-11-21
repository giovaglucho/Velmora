// ADR-006 §4.7 / §6 — selection rings and order marker (decals layer). Owner: render-engineer (R3).
// Rings follow the interpolated position of the selected units; the marker is an expanding ring from a
// pool of 8 that the input layer triggers immediately (same frame, no wait for the sim).
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { HALF_H, HALF_W } from '../constants';
import { ellipseForRadius, interpolatedInto } from '../iso';
import type { Vec2 } from '../types';
import type { SnapshotView } from '../../worker/snapshot';
import { FLAG_ALIVE } from '../../worker/snapshot';
import { MARKER_DURATION_MS, MARKER_POOL, markerAnim } from './anim';

const RING_W = 128;
const RING_H = 64;

/** White elliptical ring (2:1), anti-aliased, 128×64; tint it for colour. */
function createRingTexture(): Texture {
  const data = new Uint8Array(RING_W * RING_H * 4);
  const thick = 0.085; // in normalised radius units
  for (let y = 0; y < RING_H; y++) {
    for (let x = 0; x < RING_W; x++) {
      const u = (x + 0.5 - RING_W / 2) / (RING_W / 2);
      const v = (y + 0.5 - RING_H / 2) / (RING_H / 2);
      const d = Math.abs(Math.hypot(u, v) - (1 - thick * 1.2));
      const edge = (thick - d) * (RING_H / 2) * 0.75; // ≈ px of coverage
      const a = edge < 0 ? 0 : edge > 1 ? 1 : edge;
      const o = (y * RING_W + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(a * 255);
    }
  }
  const source = new BufferImageSource({
    resource: data,
    width: RING_W,
    height: RING_H,
    format: 'rgba8unorm',
    alphaMode: 'no-premultiply-alpha',
    scaleMode: 'linear',
    addressMode: 'clamp-to-edge',
  });
  return new Texture({ source });
}

const RING_SELECT_TINT = 0xf2f7ff;
const RING_MARKER_TINT = 0xfff0b0;

export class DecalLayer {
  private readonly ringTex = createRingTexture();
  private readonly rings: Sprite[] = [];
  private readonly markers: Sprite[] = [];
  private readonly markerBorn = new Float64Array(MARKER_POOL).fill(-1e12);
  private readonly markerX = new Float64Array(MARKER_POOL);
  private readonly markerY = new Float64Array(MARKER_POOL);
  private nextMarker = 0;
  private readonly tmp: Vec2 = { x: 0, y: 0 };
  private selected: number[] = [];
  /** Visible rings after the last update (stats / tests). */
  ringsShown = 0;

  constructor(
    private readonly layer: Container,
    private readonly radiusFx: ArrayLike<number>,
  ) {
    for (let i = 0; i < MARKER_POOL; i++) {
      const s = new Sprite(this.ringTex);
      s.anchor.set(0.5);
      s.tint = RING_MARKER_TINT;
      s.visible = false;
      layer.addChild(s);
      this.markers.push(s);
    }
  }

  /** eids of the selected units (the input layer owns the selection; this only draws it). */
  setSelected(eids: readonly number[]): void {
    this.selected = eids.slice();
  }

  /** Starts an order marker at a grid position (tiles) at `nowMs` (renderer clock). */
  spawnMarker(gx: number, gy: number, nowMs: number): void {
    const i = this.nextMarker;
    this.nextMarker = (i + 1) % MARKER_POOL;
    this.markerBorn[i] = nowMs;
    this.markerX[i] = (gx - gy) * HALF_W;
    this.markerY[i] = (gx + gy) * HALF_H;
  }

  update(view: SnapshotView | null, alpha: number, nowMs: number): void {
    // selection rings
    let n = 0;
    if (view) {
      for (let k = 0; k < this.selected.length; k++) {
        const eid = this.selected[k]!;
        const slot = eid & 0xffff;
        if (slot >= view.highWater) continue;
        if (((view.flags[slot] ?? 0) & FLAG_ALIVE) === 0 || (view.gen[slot] ?? 0) !== eid >>> 16)
          continue;
        let s = this.rings[n];
        if (!s) {
          s = new Sprite(this.ringTex);
          s.anchor.set(0.5);
          s.tint = RING_SELECT_TINT;
          this.layer.addChild(s);
          this.rings[n] = s;
        }
        interpolatedInto(this.tmp, view, slot, alpha);
        const gx = this.tmp.x / 1000;
        const gy = this.tmp.y / 1000;
        const e = ellipseForRadius(this.radiusFx[view.typeId[slot] ?? 0] ?? 500);
        s.position.set((gx - gy) * HALF_W, (gx + gy) * HALF_H);
        s.width = e.rx * 2 * 1.35;
        s.height = e.ry * 2 * 1.35;
        s.visible = true;
        n++;
      }
    }
    for (let i = n; i < this.rings.length; i++) this.rings[i]!.visible = false;
    this.ringsShown = n;
    // order marker
    for (let i = 0; i < MARKER_POOL; i++) {
      const age = nowMs - this.markerBorn[i]!;
      const s = this.markers[i]!;
      if (age < 0 || age >= MARKER_DURATION_MS) {
        s.visible = false;
        continue;
      }
      const m = markerAnim(age);
      s.position.set(this.markerX[i]!, this.markerY[i]!);
      s.width = RING_W * 0.75 * m.scale;
      s.height = RING_H * 0.75 * m.scale;
      s.alpha = m.alpha;
      s.visible = true;
    }
  }

  dispose(): void {
    for (const s of this.rings) s.destroy();
    for (const s of this.markers) s.destroy();
    this.ringTex.destroy(true);
  }
}
