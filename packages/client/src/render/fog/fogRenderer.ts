// ADR-006 §7.3 — R8 fog texture, overlay mesh, 9-tap blur shader. Owner: render-engineer (2nd) (R6).
//
// One texel per tile: 0 unexplored, 128 explored, 255 visible (target values). The displayed value fades
// towards the target on the CPU at FOG_FADE_PER_S (only the texels that changed are touched) and the texture
// is re-uploaded only on frames in which some texel moved (`fogUploads`).
import { BufferImageSource, Container, Geometry, GlProgram, Mesh, Shader } from 'pixi.js';
import { FOG_FADE_PER_S, HALF_H, HALF_W } from '../constants';
import type { FogSystem } from './fogSystem';
import { FOG_EXPLORED, FOG_UNEXPLORED, FOG_VISIBLE } from './visionGrid';

/**
 * The fade advances and the texture is uploaded at most this many times per second (R6 criterion: < 20 uploads/s
 * even with hundreds of units moving). Rendering stays at the display rate; the bilinear filter + blur hide the steps.
 */
export const FOG_MAX_UPLOAD_HZ = 15;

export const FOG_TEXEL_UNEXPLORED = 0;
export const FOG_TEXEL_EXPLORED = 128;
export const FOG_TEXEL_VISIBLE = 255;

const TARGET_BY_STATE = [FOG_TEXEL_UNEXPLORED, FOG_TEXEL_EXPLORED, FOG_TEXEL_VISIBLE] as const;

const VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vUV;
void main() {
  mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((m * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

// 9 taps (centre + cross + diagonals at ±0.75 texel, gaussian weights 4/16, 2/16, 1/16) of the R8 texture,
// then a 3-segment smoothstep: 0 -> a=1.0, 128/255 -> a=0.55, 1 -> a=0.0. Output is premultiplied alpha.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uFog;
uniform vec2 uTexel;
uniform vec2 uUvMax;
uniform vec3 uFogColor;
uniform vec3 uAlpha;
out vec4 outColor;
float tap(vec2 uv) {
  return texture(uFog, clamp(uv, uTexel * 0.5, uUvMax)).r;
}
void main() {
  vec2 o = uTexel * 0.75;
  float v = tap(vUV) * 0.25
    + (tap(vUV + vec2(o.x, 0.0)) + tap(vUV - vec2(o.x, 0.0)) + tap(vUV + vec2(0.0, o.y)) + tap(vUV - vec2(0.0, o.y))) * 0.125
    + (tap(vUV + o) + tap(vUV - o) + tap(vUV + vec2(o.x, -o.y)) + tap(vUV + vec2(-o.x, o.y))) * 0.0625;
  float mid = 128.0 / 255.0;
  float a = v < mid
    ? mix(uAlpha.x, uAlpha.y, smoothstep(0.0, mid, v))
    : mix(uAlpha.y, uAlpha.z, smoothstep(mid, 1.0, v));
  outColor = vec4(uFogColor * a, a);
}`;

/** Overlay colour (ADR-006 §7.3) and alpha per state: unexplored, explored, visible. */
export const FOG_COLOR = [0.02, 0.03, 0.05] as const;
export const FOG_ALPHA = [1.0, 0.55, 0.0] as const;

export class FogRenderer {
  /** Add this to the world container, above the entities (layer 4). Lives in world px at zoom 1. */
  readonly view = new Container();
  /** Number of texture uploads since creation (R6 criterion: < 20/s with 400 units moving). */
  fogUploads = 0;

  private readonly w: number;
  private readonly h: number;
  private readonly texW: number;
  private readonly data: Uint8Array;
  private readonly target: Uint8Array;
  private readonly inList: Uint8Array;
  private list: Int32Array;
  private listLen = 0;
  private readonly source: BufferImageSource;
  private readonly mesh: Mesh<Geometry, Shader>;
  private first = true;
  private sinceStep = 0;

  constructor(width: number, height: number) {
    this.w = width;
    this.h = height;
    // gl.UNPACK_ALIGNMENT is 4: rows must be a multiple of 4 bytes for R8.
    this.texW = (width + 3) & ~3;
    this.data = new Uint8Array(this.texW * height);
    this.target = new Uint8Array(width * height);
    this.inList = new Uint8Array(width * height);
    this.list = new Int32Array(1024);
    this.source = new BufferImageSource({
      resource: this.data,
      width: this.texW,
      height,
      format: 'r8unorm',
      scaleMode: 'linear',
      addressMode: 'clamp-to-edge',
      alphaMode: 'no-premultiply-alpha',
      autoGenerateMipmaps: false,
    });

    // Map diamond in world px (same projection as the terrain: x = (gx - gy)·HALF_W, y = (gx + gy)·HALF_H).
    const P = (gx: number, gy: number): [number, number] => [
      (gx - gy) * HALF_W,
      (gx + gy) * HALF_H,
    ];
    const [ax, ay] = P(0, 0);
    const [bx, by] = P(width, 0);
    const [cx, cy] = P(width, height);
    const [dx, dy] = P(0, height);
    const u1 = width / this.texW;
    const geometry = new Geometry({
      attributes: {
        aPosition: [ax, ay, bx, by, cx, cy, dx, dy],
        aUV: [0, 0, u1, 0, u1, 1, 0, 1],
      },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    const shader = new Shader({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT }),
      resources: {
        uFog: this.source,
        fogUniforms: {
          uTexel: { value: new Float32Array([1 / this.texW, 1 / height]), type: 'vec2<f32>' },
          uUvMax: {
            value: new Float32Array([(width - 0.5) / this.texW, (height - 0.5) / height]),
            type: 'vec2<f32>',
          },
          uFogColor: { value: new Float32Array(FOG_COLOR), type: 'vec3<f32>' },
          uAlpha: { value: new Float32Array(FOG_ALPHA), type: 'vec3<f32>' },
        },
      },
    });
    this.mesh = new Mesh({ geometry, shader });
    this.view.addChild(this.mesh);
  }

  private enqueue(i: number): void {
    if (this.inList[i] === 1) return;
    if (this.listLen === this.list.length) {
      const bigger = new Int32Array(this.list.length * 2);
      bigger.set(this.list);
      this.list = bigger;
    }
    this.inList[i] = 1;
    this.list[this.listLen++] = i;
  }

  /**
   * Sets the target of every tile from FOG_* states (length W*H). The first call (or `snap = true`)
   * jumps to the target without fading (initial load, scenario change).
   */
  setStates(states: Uint8Array, snap = false): void {
    const n = this.w * this.h;
    const doSnap = snap || this.first;
    this.first = false;
    let uploaded = false;
    for (let i = 0; i < n; i++) {
      const t = TARGET_BY_STATE[states[i] ?? FOG_UNEXPLORED] ?? FOG_TEXEL_UNEXPLORED;
      if (this.target[i] === t && !doSnap) continue;
      this.target[i] = t;
      const di = this.dataIndex(i);
      if (doSnap) {
        if (this.data[di] !== t) {
          this.data[di] = t;
          uploaded = true;
        }
      } else if (this.data[di] !== t) this.enqueue(i);
    }
    if (uploaded) this.upload();
  }

  private dataIndex(i: number): number {
    const y = (i / this.w) | 0;
    return y * this.texW + (i - y * this.w);
  }

  private upload(): void {
    this.source.update();
    this.fogUploads++;
  }

  /**
   * Advances the fade by `dtSec` (time comes in as a parameter). The work is batched to FOG_MAX_UPLOAD_HZ: calls in
   * between only accumulate time. Returns true if the texture was uploaded.
   */
  step(dtSec: number): boolean {
    if (this.listLen === 0) {
      this.sinceStep = 0;
      return false;
    }
    this.sinceStep += dtSec;
    if (this.sinceStep * FOG_MAX_UPLOAD_HZ < 1) return false;
    const stepV = Math.max(1, Math.ceil(FOG_FADE_PER_S * 255 * this.sinceStep));
    this.sinceStep = 0;
    let w = 0;
    for (let k = 0; k < this.listLen; k++) {
      const i = this.list[k] as number;
      const di = this.dataIndex(i);
      const cur = this.data[di] as number;
      const t = this.target[i] as number;
      const next = cur < t ? Math.min(t, cur + stepV) : Math.max(t, cur - stepV);
      this.data[di] = next;
      if (next === t) this.inList[i] = 0;
      else this.list[w++] = i;
    }
    this.listLen = w;
    this.upload();
    return true;
  }

  /** Per-frame hook: feed changes from the FogSystem (if any) and advance the fade. */
  sync(system: FogSystem, changed: boolean, dtSec: number): boolean {
    if (changed) this.setStates(system.states);
    return this.step(dtSec);
  }

  /** Target FOG_* state of a tile (what the shader converges to). */
  targetState(tx: number, ty: number): number {
    const t = this.target[ty * this.w + tx];
    return t === FOG_TEXEL_VISIBLE
      ? FOG_VISIBLE
      : t === FOG_TEXEL_EXPLORED
        ? FOG_EXPLORED
        : FOG_UNEXPLORED;
  }

  /** Currently displayed texel value (0..255) of a tile. */
  shownValue(tx: number, ty: number): number {
    return this.data[ty * this.texW + tx] ?? 0;
  }

  /** True while any texel is still fading. */
  get fading(): boolean {
    return this.listLen > 0;
  }

  dispose(): void {
    this.view.destroy({ children: true });
    this.source.destroy();
  }
}
