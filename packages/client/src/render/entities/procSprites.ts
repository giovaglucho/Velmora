// Provisional unit sprites generated in memory (PURE, deterministic, no Pixi). Owner: render-engineer (R3).
// Stand-in until art-pipeline (A2) ships the atlas; the Pixi side consumes either through `UnitAtlas` (atlas.ts).
// Convention (ADR-006 §4.7): dir k points to screen vector (dx - dy, (dx + dy) / 2) of the grid angle k·1024/dirs.

export const FRAME_W = 64;
export const FRAME_H = 96;
export const PROC_DIRS = 8;
export const PROC_WALK_FRAMES = 4;
/** Foot (ground contact) y inside the frame = anchor 0.88. */
const FOOT_Y = 84;

/** Screen-space unit vector of direction `dir` (of `dirs`). */
export function dirScreenVec(dir: number, dirs: number): { x: number; y: number } {
  const a = (dir * 2 * Math.PI) / dirs;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const sx = dx - dy;
  const sy = (dx + dy) / 2;
  const l = Math.hypot(sx, sy) || 1;
  return { x: sx / l, y: sy / l };
}

function cover(d: number, edge: number): number {
  // anti-aliased coverage from a signed distance (negative inside)
  const v = 0.5 - (d - edge);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function sdCapsule(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
): number {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

export interface ProcFrame {
  body: Uint8Array; // RGBA, FRAME_W × FRAME_H
  team: Uint8Array; // white mask where the team colour goes (alpha = coverage)
}

/** One frame: `dir` of `dirs`, `anim` 0 = idle, 1..4 = walk (vertical bob). */
export function generateUnitFrame(dir: number, dirs: number, anim: number): ProcFrame {
  const body = new Uint8Array(FRAME_W * FRAME_H * 4);
  const team = new Uint8Array(FRAME_W * FRAME_H * 4);
  const cx = FRAME_W / 2;
  const bob = anim === 0 ? 0 : anim % 2 === 1 ? -1 : -3;
  const v = dirScreenVec(dir, dirs);
  const baseY = FOOT_Y - 2 + bob;
  const topY = FOOT_Y - 40 + bob;
  const headY = topY - 8;
  const noseX = cx + v.x * 7;
  const noseY = headY + 1 + v.y * 4;
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * FRAME_W + x) * 4;
      // baked shadow (ellipse at the foot), under everything
      const sh = Math.hypot((px - cx) / 15, (py - FOOT_Y) / 6) - 1;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const sa = cover(sh * 6, 0) * 0.35;
      if (sa > 0) {
        a = sa;
      }
      // torso capsule
      const dBody = sdCapsule(px, py, cx, baseY, cx, topY, 8.5);
      const aBody = cover(dBody, 0);
      const dHead = Math.hypot(px - cx, py - headY) - 6.5;
      const aHead = cover(dHead, 0);
      const dNose = Math.hypot(px - noseX, py - noseY) - 2.2;
      const aNose = cover(dNose, 0);
      const outline = cover(Math.min(dBody, dHead) - 1.2, 0);
      // composite: outline < body < head < nose over shadow
      const over = (cr: number, cg: number, cb: number, ca: number) => {
        const oa = ca + a * (1 - ca);
        if (oa > 0) {
          r = (cr * ca + r * a * (1 - ca)) / oa;
          g = (cg * ca + g * a * (1 - ca)) / oa;
          b = (cb * ca + b * a * (1 - ca)) / oa;
        }
        a = oa;
      };
      if (sa > 0) {
        r = g = b = 0;
      }
      over(20, 20, 24, outline);
      // simple vertical shading on the torso
      const shade = 0.78 + 0.22 * Math.min(1, Math.max(0, (py - topY) / (baseY - topY)));
      over(215 * shade, 205 * shade, 190 * shade, aBody);
      over(232, 214, 190, aHead);
      over(40, 36, 44, aNose);
      const o = i;
      body[o] = Math.round(r);
      body[o + 1] = Math.round(g);
      body[o + 2] = Math.round(b);
      body[o + 3] = Math.round(a * 255);
      // team mask: belt/torso band, white, only where the torso is
      const band = py >= topY + 4 && py <= topY + 20 ? 1 : 0;
      const ta = aBody * band;
      team[o] = team[o + 1] = team[o + 2] = 255;
      team[o + 3] = Math.round(ta * 255);
    }
  }
  return { body, team };
}

/** Atlas layout: columns = anim (0..PROC_WALK_FRAMES), rows = dir × 2 + layer (0 = body, 1 = team). */
export function atlasSize(dirs: number): { width: number; height: number } {
  return { width: FRAME_W * (PROC_WALK_FRAMES + 1), height: FRAME_H * dirs * 2 };
}
export function generateAtlas(dirs = PROC_DIRS): Uint8Array {
  const { width, height } = atlasSize(dirs);
  const out = new Uint8Array(width * height * 4);
  for (let d = 0; d < dirs; d++) {
    for (let anim = 0; anim <= PROC_WALK_FRAMES; anim++) {
      const f = generateUnitFrame(d, dirs, anim);
      for (let layer = 0; layer < 2; layer++) {
        const src = layer === 0 ? f.body : f.team;
        const ox = anim * FRAME_W;
        const oy = (d * 2 + layer) * FRAME_H;
        for (let y = 0; y < FRAME_H; y++) {
          const so = y * FRAME_W * 4;
          out.set(src.subarray(so, so + FRAME_W * 4), ((oy + y) * width + ox) * 4);
        }
      }
    }
  }
  return out;
}

/** Provisional per-type body tint (0xRRGGBB) so different unit types are tellable apart. */
const TYPE_TINTS: readonly number[] = [0xffffff, 0xffe9c2, 0xd9e8ff, 0xe4ffd0, 0xffd6e8];
export function provisionalTint(typeId: number): number {
  return TYPE_TINTS[typeId % TYPE_TINTS.length] ?? 0xffffff;
}
