// ADR-006 §4.7 — per-slot sprite pool, interpolation, depth order and culling. Owner: render-engineer (R3).
// Sprite = slot (no lookup tables). A body + team-mask pair per live, visible slot; both share the atlas
// source and the same zIndex (= depthKey), so they batch and stay adjacent in the sorted child list.
import { Container, Sprite } from 'pixi.js';
import { HALF_H, HALF_W, PLAYER_COLORS } from '../constants';
import { spriteVisible, SPRITE_ANCHOR_Y } from '../culling';
import { depthKey } from '../depth';
import { interpolatedInto } from '../iso';
import type { Camera, Vec2, Viewport } from '../types';
import { FLAG_ALIVE, FLAG_MOVING, OWNER_NEUTRAL, type SnapshotView } from '../../worker/snapshot';
import { animFrame, unitDir } from './anim';
import type { UnitAtlas } from './atlas';

const NEUTRAL_TINT = 0x9ca3af;

export class UnitLayer {
  private bodies: Array<Sprite | undefined> = [];
  private teams: Array<Sprite | undefined> = [];
  private shown = new Uint8Array(0);
  private frameKey = new Int32Array(0);
  private depth = new Int32Array(0);
  private ownerSeen = new Int16Array(0);
  private wasAlive = new Uint8Array(0);
  private readonly tmp: Vec2 = { x: 0, y: 0 };
  /** Units drawn in the last update (after culling). */
  visibleUnits = 0;

  constructor(
    private readonly layer: Container,
    private readonly atlas: UnitAtlas,
  ) {
    layer.sortableChildren = true;
  }

  private grow(capacity: number): void {
    if (this.shown.length >= capacity) return;
    const g = <T extends Uint8Array | Int32Array | Int16Array>(
      a: T,
      C: new (n: number) => T,
      fill = 0,
    ): T => {
      const b = new C(capacity);
      if (fill) b.fill(fill);
      b.set(a);
      return b;
    };
    this.shown = g(this.shown, Uint8Array);
    this.wasAlive = g(this.wasAlive, Uint8Array);
    this.frameKey = g(this.frameKey, Int32Array);
    this.depth = g(this.depth, Int32Array);
    this.ownerSeen = g(this.ownerSeen, Int16Array);
  }

  private spritePair(slot: number): void {
    const body = new Sprite();
    const team = new Sprite();
    body.anchor.set(0.5, SPRITE_ANCHOR_Y);
    team.anchor.set(0.5, SPRITE_ANCHOR_Y);
    body.visible = team.visible = false;
    // creation order = tie-break at equal zIndex: team always right after body
    this.layer.addChild(body, team);
    this.bodies[slot] = body;
    this.teams[slot] = team;
    this.frameKey[slot] = -1;
    this.ownerSeen[slot] = -1;
  }

  /**
   * Updates sprites from `view` for this frame. `alpha` = interpolation factor (ADR-006 §3.7);
   * positions go straight to world px (the parent container carries camera pan/zoom).
   */
  update(view: SnapshotView | null, alpha: number, cam: Camera, vp: Viewport): void {
    let visible = 0;
    if (!view) {
      this.hideAll(0);
      this.visibleUnits = 0;
      return;
    }
    this.grow(view.posX.length);
    const hw = view.highWater;
    const zoom = cam.zoomT;
    const halfW = vp.vw / 2;
    const halfH = vp.vh / 2;
    const dirs = this.atlas.dirs;
    const tick = view.tick;
    for (let slot = 0; slot < hw; slot++) {
      const flags = view.flags[slot] ?? 0;
      if ((flags & FLAG_ALIVE) === 0) {
        this.wasAlive[slot] = 0;
        this.hide(slot);
        continue;
      }
      // dead → alive: no interpolation this frame (spawn); pos is authoritative
      const born = this.wasAlive[slot] === 0;
      this.wasAlive[slot] = 1;
      interpolatedInto(this.tmp, view, slot, born ? 1 : alpha);
      const fx = this.tmp.x;
      const fy = this.tmp.y;
      const gx = fx / 1000;
      const gy = fy / 1000;
      const wx = (gx - gy) * HALF_W;
      const wy = (gx + gy) * HALF_H;
      const sx = (wx - cam.x) * zoom + halfW;
      const sy = (wy - cam.y) * zoom + halfH;
      if (!spriteVisible(sx, sy, zoom, vp)) {
        this.hide(slot);
        continue;
      }
      if (!this.bodies[slot]) this.spritePair(slot);
      const body = this.bodies[slot]!;
      const team = this.teams[slot]!;
      const typeId = view.typeId[slot] ?? 0;
      const dir = unitDir(view.facing[slot] ?? 0, dirs);
      const anim = animFrame(tick, slot, (flags & FLAG_MOVING) !== 0);
      const key = (typeId << 12) | (dir << 4) | anim;
      if (this.frameKey[slot] !== key) {
        this.frameKey[slot] = key;
        body.texture = this.atlas.body(typeId, dir, anim);
        team.texture = this.atlas.team(typeId, dir, anim);
        body.tint = this.atlas.bodyTint(typeId);
      }
      const owner = view.owner[slot] ?? OWNER_NEUTRAL;
      if (this.ownerSeen[slot] !== owner) {
        this.ownerSeen[slot] = owner;
        team.tint =
          owner === OWNER_NEUTRAL
            ? NEUTRAL_TINT
            : (PLAYER_COLORS[owner % PLAYER_COLORS.length] ?? NEUTRAL_TINT);
      }
      body.position.set(wx, wy);
      team.position.set(wx, wy);
      const dk = depthKey(Math.round(fx), Math.round(fy), slot);
      if (this.depth[slot] !== dk) {
        this.depth[slot] = dk;
        body.zIndex = dk;
        team.zIndex = dk;
      }
      if (this.shown[slot] === 0) {
        this.shown[slot] = 1;
        body.visible = team.visible = true;
      }
      visible++;
    }
    this.hideAll(hw);
    this.visibleUnits = visible;
  }

  private hide(slot: number): void {
    if (this.shown[slot] === 1) {
      this.shown[slot] = 0;
      const b = this.bodies[slot];
      const t = this.teams[slot];
      if (b) b.visible = false;
      if (t) t.visible = false;
    }
  }
  private hideAll(from: number): void {
    for (let s = from; s < this.shown.length; s++) this.hide(s);
  }

  dispose(): void {
    for (const s of this.bodies) s?.destroy();
    for (const s of this.teams) s?.destroy();
    this.bodies = [];
    this.teams = [];
  }
}
