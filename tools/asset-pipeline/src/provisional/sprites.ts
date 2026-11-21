import { Canvas, capsule, ellipse, polygon, rect, type Color, type Shape } from './raster.js';
import { createRgba, type Rgba } from './png.js';

export const DIRS = 8;
export const UNIT_FRAME: readonly [number, number] = [64, 96];
export const BUILDING_FRAME: readonly [number, number] = [128, 128];
export const ANIM = { idle: 1, walk: 4 } as const;
export const ANIM_NAMES = ['idle0', 'walk0', 'walk1', 'walk2', 'walk3'] as const;
export type AnimName = (typeof ANIM_NAMES)[number];
export const UNIT_APPEARANCES = ['civil', 'infantry', 'ranged', 'cavalry', 'generic'] as const;
export type UnitAppearance = (typeof UNIT_APPEARANCES)[number];
export const LAYERS = ['body', 'team'] as const;
export type Layer = (typeof LAYERS)[number];

/** Pixi frame name (ADR-006 §9): `<appearance>/<body|team>/<dir>/<idle0|walk0..3>`. */
export const frameName = (app: string, layer: Layer, dir: number, anim: AnimName): string =>
  `${app}/${layer}/${dir}/${anim}`;

const S = 0.7071067811865476; // sqrt(1/2), literal so no transcendental math is involved
/** Grid direction k = angle k*1024/8 of the sim: 0 = +x grid, growing toward +y grid (ADR-006 §4.7). */
const GRID_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [S, S],
  [0, 1],
  [-S, S],
  [-1, 0],
  [-S, -S],
  [0, -1],
  [S, -S],
];

/** Unit vector on screen for direction k: screenVec = (dx - dy, (dx + dy) / 2), normalised. */
export function screenDir(k: number): [number, number] {
  const [dx, dy] = GRID_DIRS[k]!;
  const sx = dx - dy;
  const sy = (dx + dy) / 2;
  const len = Math.sqrt(sx * sx + sy * sy);
  return [sx / len, sy / len];
}

/** Direction indicator colour: unique in the palette so tests can locate it. */
export const INDICATOR: Color = [255, 230, 40, 1];
const TEAM_GRAY: Color = [200, 200, 200, 1];
const WHITE: Color = [255, 255, 255, 1];
const OUTLINE: Color = [24, 20, 18, 1];
const SHADOW: Color = [0, 0, 0, 0.32];
const SKIN: Color = [226, 184, 140, 1];
const BROWN: Color = [96, 68, 44, 1];

/** Paint helper: `body` layer draws everything (team zones in neutral gray); `team` draws only team zones in white. */
class Painter {
  constructor(
    private readonly c: Canvas,
    private readonly layer: Layer,
  ) {}

  /** `make(pad)` builds the shape grown by `pad` px so a 1px outline can be drawn behind it. */
  part(
    make: (pad: number) => Shape,
    color: Color,
    opts: { team?: boolean; outline?: boolean } = {},
  ): void {
    if (this.layer === 'team') {
      if (opts.team) this.c.fill(make(0), WHITE);
      return;
    }
    if (opts.outline !== false && !opts.team) this.c.fill(make(1), OUTLINE);
    this.c.fill(make(0), opts.team ? TEAM_GRAY : color);
  }

  /** Body-only decoration without outline. */
  bodyOnly(shape: Shape, color: Color): void {
    if (this.layer === 'body') this.c.fill(shape, color);
  }
}

const cap = (ax: number, ay: number, bx: number, by: number, r: number) => (pad: number) =>
  capsule(ax, ay, bx, by, r + pad);
const ell = (cx: number, cy: number, rx: number, ry: number) => (pad: number) =>
  ellipse(cx, cy, rx + pad, ry + pad);

const BOB = [0, 0, 2, 0, 2];
const SWING = [0, -1, 0, 1, 0];

interface Pose {
  n: [number, number];
  bob: number;
  swing: number;
}

function legs(p: Painter, pose: Pose, hipY: number, color: Color, r: number): void {
  const { n, bob, swing } = pose;
  for (const side of [-1, 1]) {
    const s = swing * side;
    const hx = 32 + side * 3;
    p.part(cap(hx, hipY - bob, hx + n[0] * 5 * s, 84 + n[1] * 5 * s - (s > 0 ? 1 : 0), r), color);
  }
}

function indicator(p: Painter, hx: number, hy: number, n: [number, number], reach: number): void {
  p.bodyOnly(ellipse(hx + n[0] * reach, hy + n[1] * reach * 0.6, 2.2, 2.2), INDICATOR);
}

function drawCivil(p: Painter, pose: Pose): void {
  const { n, bob } = pose;
  legs(p, pose, 72, [84, 60, 40, 1], 2.4);
  p.part(cap(32, 66 - bob, 32, 52 - bob, 7), [176, 140, 96, 1]);
  p.part(cap(32, 62 - bob, 32, 56 - bob, 7), TEAM_GRAY, { team: true }); // apron band
  p.part(ell(32, 43 - bob, 5.5, 6), SKIN);
  p.bodyOnly(ellipse(32, 39 - bob, 5.6, 3.2), [96, 70, 46, 1]); // hair/cap
  // hoe held on the left side of the facing direction
  const px = -n[1] * 9;
  p.bodyOnly(capsule(32 + px, 60 - bob, 32 + px + n[0] * 3, 40 - bob, 1.1), BROWN);
  indicator(p, 32, 43 - bob, n, 6);
}

function drawInfantry(p: Painter, pose: Pose): void {
  const { n, bob } = pose;
  legs(p, pose, 72, [70, 70, 80, 1], 2.8);
  p.part(cap(32, 66 - bob, 32, 50 - bob, 8), [138, 146, 158, 1]);
  p.part(ell(32, 41 - bob, 6, 6.5), SKIN);
  p.part(ell(32, 38 - bob, 6.6, 4.2), [120, 126, 138, 1]); // helmet
  const perp: [number, number] = [-n[1], n[0] * 0.5];
  const sx = 32 + perp[0] * 11;
  const sy = 58 - bob + perp[1] * 6;
  p.part(cap(32 - perp[0] * 10, 62 - bob, 32 - perp[0] * 10 + n[0] * 2, 26 - bob, 1.3), BROWN); // spear
  p.part(ell(sx, sy, 6, 8), TEAM_GRAY, { team: true }); // shield
  indicator(p, 32, 41 - bob, n, 7);
}

function drawRanged(p: Painter, pose: Pose): void {
  const { n, bob } = pose;
  legs(p, pose, 72, [64, 74, 52, 1], 2.4);
  p.part(cap(32, 66 - bob, 32, 52 - bob, 7), [86, 120, 74, 1]);
  p.part(ell(32, 55 - bob, 6.4, 3.4), TEAM_GRAY, { team: true }); // shoulder cape
  p.part(ell(32, 43 - bob, 5.5, 6), SKIN);
  p.bodyOnly(ellipse(32, 40 - bob, 6.2, 4), [62, 92, 54, 1]); // hood
  // bow: two segments forming a "(" shape, held ahead of the body
  const bx = 32 + n[0] * 9;
  const by = 58 - bob + n[1] * 5;
  p.part(cap(bx - n[0] * 2, by - 12, bx + n[0] * 2, by, 1.3), BROWN, { outline: false });
  p.part(cap(bx + n[0] * 2, by, bx - n[0] * 2, by + 12, 1.3), BROWN, { outline: false });
  indicator(p, 32, 43 - bob, n, 6);
}

function drawCavalry(p: Painter, pose: Pose): void {
  const { n, bob, swing } = pose;
  const cx = 32;
  const cy = 66 - bob;
  const hx = n[0] * 9;
  const hy = n[1] * 9;
  const perp: [number, number] = [-n[1], n[0]];
  // four legs (two on each side of the body axis)
  for (const a of [-1, 1]) {
    for (const side of [-1, 1]) {
      const lx = cx + a * hx * 0.8 + perp[0] * side * 3;
      const ly = cy + 4 + a * hy * 0.8 * 0.5;
      const s = swing * a * side;
      p.part(cap(lx, ly, lx + n[0] * 4 * s, 84 + n[1] * 3 * s, 2.2), [92, 62, 38, 1]);
    }
  }
  p.part(cap(cx - hx, cy - hy * 0.5, cx + hx, cy + hy * 0.5, 7.5), [128, 88, 56, 1]); // horse body
  p.part(ell(cx, cy - 7, 6, 3.4), TEAM_GRAY, { team: true }); // saddle blanket
  const headX = cx + hx * 1.5;
  const headY = cy + hy * 0.75 - 7;
  p.part(cap(cx + hx, cy - hy * 0.5 - 2, headX, headY, 3.4), [112, 76, 48, 1]); // neck + head
  p.part(cap(cx, cy - 8, cx, cy - 20, 5.2), [138, 146, 158, 1]); // rider torso
  p.part(ell(cx, cy - 25, 4.5, 5), SKIN);
  p.bodyOnly(ellipse(cx, cy - 28, 4.8, 3), [120, 126, 138, 1]);
  indicator(p, headX, headY, n, 4);
}

function drawGeneric(p: Painter, pose: Pose): void {
  const { n, bob } = pose;
  legs(p, pose, 72, [76, 76, 84, 1], 2.4);
  p.part(cap(32, 66 - bob, 32, 52 - bob, 7), [128, 128, 140, 1]);
  p.part(cap(32, 62 - bob, 32, 58 - bob, 7), TEAM_GRAY, { team: true });
  p.part(ell(32, 43 - bob, 5.5, 6), [190, 190, 196, 1]);
  indicator(p, 32, 43 - bob, n, 6);
}

const UNIT_DRAW: Record<UnitAppearance, (p: Painter, pose: Pose) => void> = {
  civil: drawCivil,
  infantry: drawInfantry,
  ranged: drawRanged,
  cavalry: drawCavalry,
  generic: drawGeneric,
};

/** Draw one unit frame (64x96). Foot anchor is (32, 84) = (0.5, 0.88). */
export function drawUnit(app: UnitAppearance, layer: Layer, dir: number, anim: AnimName): Canvas {
  const c = new Canvas(UNIT_FRAME[0], UNIT_FRAME[1]);
  const i = ANIM_NAMES.indexOf(anim);
  const pose: Pose = { n: screenDir(dir), bob: BOB[i]!, swing: SWING[i]! };
  const p = new Painter(c, layer);
  if (layer === 'body')
    c.fill(ellipse(32, 84, app === 'cavalry' ? 20 : 14, app === 'cavalry' ? 8 : 6.5), SHADOW);
  UNIT_DRAW[app](p, pose);
  return c;
}

/**
 * Placeholder building (128x128, anchor bottom centre (64, 112)): isometric box with a hip roof,
 * a door whose face depends on the direction, and a team-coloured banner.
 */
export function drawBuilding(layer: Layer, dir: number): Canvas {
  const c = new Canvas(BUILDING_FRAME[0], BUILDING_FRAME[1]);
  const p = new Painter(c, layer);
  const W: [number, number] = [12, 100];
  const Sp: [number, number] = [64, 126];
  const E: [number, number] = [116, 100];
  const Wt: [number, number] = [12, 62];
  const St: [number, number] = [64, 88];
  const Et: [number, number] = [116, 62];
  const apex: [number, number] = [64, 26];
  if (layer === 'body') c.fill(polygon([W, [64, 74], E, Sp]), SHADOW);
  p.part(() => polygon([W, Sp, St, Wt]), [160, 138, 108, 1]); // left wall
  p.part(() => polygon([Sp, E, Et, St]), [124, 104, 82, 1]); // right wall
  p.part(() => polygon([Wt, St, apex]), [150, 76, 58, 1]); // roof left
  p.part(() => polygon([St, Et, apex]), TEAM_GRAY, { team: true }); // roof right = team colour
  // door: on the right wall for dirs 0-1, left wall for dirs 2-3; hidden facing away (dirs 4-7)
  if (dir <= 1) {
    p.bodyOnly(
      polygon([
        [78, 107],
        [96, 98],
        [96, 78],
        [78, 87],
      ]),
      [52, 38, 28, 1],
    );
  } else if (dir <= 3) {
    p.bodyOnly(
      polygon([
        [50, 107],
        [32, 98],
        [32, 78],
        [50, 87],
      ]),
      [52, 38, 28, 1],
    );
  }
  // banner pole at the apex, flag toward the facing direction
  const n = screenDir(dir);
  p.part(() => rect(63, 8, 2, 24), BROWN, { outline: false });
  p.part(
    () =>
      polygon([
        [65, 8],
        [65 + n[0] * 12 + 8, 12 + n[1] * 4],
        [65, 18],
      ]),
    TEAM_GRAY,
    { team: true },
  );
  return c;
}

export interface AtlasFrame {
  name: string;
  canvas: Canvas;
}

export interface Atlas {
  image: Rgba;
  /** Pixi spritesheet JSON (frames + meta). */
  json: {
    frames: Record<
      string,
      {
        frame: { x: number; y: number; w: number; h: number };
        spriteSourceSize: { x: number; y: number; w: number; h: number };
        sourceSize: { w: number; h: number };
      }
    >;
    meta: { image: string; format: 'RGBA8888'; size: { w: number; h: number }; scale: '1' };
  };
}

/** Pack equally sized frames in row-major order into a power-of-two atlas. */
export function packAtlas(
  frames: AtlasFrame[],
  cell: readonly [number, number],
  atlasW: number,
  atlasH: number,
  imageName: string,
): Atlas {
  const cols = Math.floor(atlasW / cell[0]);
  const rows = Math.floor(atlasH / cell[1]);
  if (frames.length > cols * rows)
    throw new Error(`atlas ${imageName}: ${frames.length} frames > ${cols * rows} slots`);
  const image = createRgba(atlasW, atlasH);
  const out: Atlas['json']['frames'] = {};
  frames.forEach((f, i) => {
    const x = (i % cols) * cell[0];
    const y = Math.floor(i / cols) * cell[1];
    f.canvas.blit(image, x, y);
    out[f.name] = {
      frame: { x, y, w: cell[0], h: cell[1] },
      spriteSourceSize: { x: 0, y: 0, w: cell[0], h: cell[1] },
      sourceSize: { w: cell[0], h: cell[1] },
    };
  });
  return {
    image,
    json: {
      frames: out,
      meta: { image: imageName, format: 'RGBA8888', size: { w: atlasW, h: atlasH }, scale: '1' },
    },
  };
}

export function buildUnitAtlas(): Atlas {
  const frames: AtlasFrame[] = [];
  for (const app of UNIT_APPEARANCES)
    for (const layer of LAYERS)
      for (let d = 0; d < DIRS; d++)
        for (const a of ANIM_NAMES)
          frames.push({ name: frameName(app, layer, d, a), canvas: drawUnit(app, layer, d, a) });
  return packAtlas(frames, UNIT_FRAME, 2048, 2048, 'units.png');
}

/** Buildings are static: one `idle0` frame per direction and layer. */
export function buildBuildingAtlas(): Atlas {
  const frames: AtlasFrame[] = [];
  for (const layer of LAYERS)
    for (let d = 0; d < DIRS; d++)
      frames.push({
        name: frameName('building', layer, d, 'idle0'),
        canvas: drawBuilding(layer, d),
      });
  return packAtlas(frames, BUILDING_FRAME, 512, 512, 'buildings.png');
}

/** UI atlas (256x128): selection ring, 4 order-marker frames, minimap dot. */
export const UI_ATLAS_SIZE: readonly [number, number] = [256, 128];
export const UI_FRAMES = {
  ring: { x: 0, y: 0, w: 128, h: 64 },
  marker0: { x: 128, y: 0, w: 64, h: 32 },
  marker1: { x: 192, y: 0, w: 64, h: 32 },
  marker2: { x: 128, y: 32, w: 64, h: 32 },
  marker3: { x: 192, y: 32, w: 64, h: 32 },
  dot: { x: 0, y: 64, w: 4, h: 4 },
} as const;

export function buildUiAtlas(): Atlas {
  const image = createRgba(UI_ATLAS_SIZE[0], UI_ATLAS_SIZE[1]);
  const frames: Atlas['json']['frames'] = {};
  const place = (name: keyof typeof UI_FRAMES, draw: (c: Canvas) => void): void => {
    const f = UI_FRAMES[name];
    const c = new Canvas(f.w, f.h);
    draw(c);
    c.blit(image, f.x, f.y);
    frames[name] = {
      frame: { ...f },
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize: { w: f.w, h: f.h },
    };
  };
  const white: Color = [255, 255, 255, 1];
  // Elliptical band: outer ellipse minus inner ellipse (point-in-shape test), antialiased by the canvas.
  const band = (cx: number, cy: number, rx: number, ry: number, t: number): Shape => {
    const outer = ellipse(cx, cy, rx, ry);
    const inner = ellipse(cx, cy, rx - t, ry - t / 2);
    return {
      x0: outer.x0,
      y0: outer.y0,
      x1: outer.x1,
      y1: outer.y1,
      contains: (x, y) => outer.contains(x, y) && !inner.contains(x, y),
    };
  };
  place('ring', (c) => c.fill(band(64, 32, 62, 31, 4), white));
  const steps: Array<[number, number]> = [
    [8, 1],
    [16, 0.8],
    [24, 0.55],
    [30, 0.3],
  ];
  (['marker0', 'marker1', 'marker2', 'marker3'] as const).forEach((n, i) => {
    const [rx, a] = steps[i]!;
    place(n, (c) => c.fill(band(32, 16, rx, rx / 2, 2.5), [255, 255, 255, a]));
  });
  place('dot', (c) => c.fill(rect(0, 0, 4, 4), white));
  return {
    image,
    json: {
      frames,
      meta: {
        image: 'ui.png',
        format: 'RGBA8888',
        size: { w: UI_ATLAS_SIZE[0], h: UI_ATLAS_SIZE[1] },
        scale: '1',
      },
    },
  };
}
