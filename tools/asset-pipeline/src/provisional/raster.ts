import type { Rgba } from './png.js';

/** Straight RGBA color, channels 0..255 (alpha 0..1). */
export type Color = readonly [number, number, number, number];

/** A shape is a bounding box plus a point-in-shape test (pixel space, y down). */
export interface Shape {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  contains(x: number, y: number): boolean;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): Shape {
  return {
    x0: cx - rx,
    y0: cy - ry,
    x1: cx + rx,
    y1: cy + ry,
    contains: (x, y) => {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1;
    },
  };
}

/** Thick segment with round caps. */
export function capsule(ax: number, ay: number, bx: number, by: number, r: number): Shape {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  return {
    x0: Math.min(ax, bx) - r,
    y0: Math.min(ay, by) - r,
    x1: Math.max(ax, bx) + r,
    y1: Math.max(ay, by) + r,
    contains: (x, y) => {
      let t = len2 === 0 ? 0 : ((x - ax) * vx + (y - ay) * vy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (ax + vx * t);
      const dy = y - (ay + vy * t);
      return dx * dx + dy * dy <= r * r;
    },
  };
}

/** Simple polygon (even-odd). */
export function polygon(pts: ReadonlyArray<readonly [number, number]>): Shape {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of pts) {
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  return {
    x0,
    y0,
    x1,
    y1,
    contains: (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
  };
}

export function rect(x: number, y: number, w: number, h: number): Shape {
  return polygon([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

const SS = 4; // 4x4 supersampling = 16 coverage levels

/** Premultiplied float canvas; shapes are composited "over" with 4x4 supersampled antialiasing. */
export class Canvas {
  readonly w: number;
  readonly h: number;
  private readonly px: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Float32Array(w * h * 4);
  }

  fill(shape: Shape, color: Color): void {
    const xa = Math.max(0, Math.floor(shape.x0));
    const ya = Math.max(0, Math.floor(shape.y0));
    const xb = Math.min(this.w - 1, Math.ceil(shape.x1));
    const yb = Math.min(this.h - 1, Math.ceil(shape.y1));
    const ca = color[3];
    const pr = (color[0] / 255) * ca;
    const pg = (color[1] / 255) * ca;
    const pb = (color[2] / 255) * ca;
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (shape.contains(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
          }
        }
        if (hits === 0) continue;
        const cov = hits / (SS * SS);
        const o = (y * this.w + x) * 4;
        const inv = 1 - ca * cov;
        this.px[o] = pr * cov + this.px[o]! * inv;
        this.px[o + 1] = pg * cov + this.px[o + 1]! * inv;
        this.px[o + 2] = pb * cov + this.px[o + 2]! * inv;
        this.px[o + 3] = ca * cov + this.px[o + 3]! * inv;
      }
    }
  }

  /** Copy into `dst` (straight alpha, 8 bit) with the top-left corner at (ox, oy). */
  blit(dst: Rgba, ox: number, oy: number): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const o = (y * this.w + x) * 4;
        const a = this.px[o + 3]!;
        const d = ((oy + y) * dst.width + (ox + x)) * 4;
        if (a <= 0) {
          dst.data[d] = dst.data[d + 1] = dst.data[d + 2] = dst.data[d + 3] = 0;
          continue;
        }
        dst.data[d] = Math.round(Math.min(1, this.px[o]! / a) * 255);
        dst.data[d + 1] = Math.round(Math.min(1, this.px[o + 1]! / a) * 255);
        dst.data[d + 2] = Math.round(Math.min(1, this.px[o + 2]! / a) * 255);
        dst.data[d + 3] = Math.round(Math.min(1, a) * 255);
      }
    }
  }
}
