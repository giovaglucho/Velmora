// ADR-006 §4.6 — terrain splatting shaders (GLSL ES 3.00) as strings. Owner: render-engineer (R2).
// Everything is sampled in GRID space (not per tile, not per chunk), so the pattern is continuous across
// tile/chunk borders and the projection; the per-vertex weight texture is filtered bilinearly.
import { TERRAIN_TEX_PERIOD_TILES } from '../constants';

/** Presentation constants of the splat blend (ADR-006 §4.6); not balance values. */
export const SPLAT_NOISE_AMP = 0.45;
export const SPLAT_SHARPNESS = 3.0;
const NOISE_PERIOD_A = 8.0;
const NOISE_PERIOD_B = 4.7;
const NOISE_PERIOD_C = 6.1;

export const TERRAIN_VERT = `#version 300 es
in vec2 aPosition;
in vec2 aGrid;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vGrid;
void main() {
  mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((m * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vGrid = aGrid;
}`;

/**
 * `hardTiles` is the negative control of the seam metric (Q3): weights come from one-hot TILE data sampled
 * at floor(grid), i.e. independent tiles with hard borders. Production uses `hardTiles = false`.
 */
export function splatFragment(hardTiles = false): string {
  const f = (n: number) => n.toFixed(4);
  const splatUv = hardTiles ? '(floor(vGrid) + 0.5) * uSplatInv' : '(vGrid + 0.5) * uSplatInv';
  return `#version 300 es
precision highp float;
in vec2 vGrid;
uniform sampler2D uSplat;
uniform sampler2D uSplat2;
uniform sampler2D uNoise;
uniform sampler2D uWater;
uniform sampler2D uForest;
uniform sampler2D uG0;
uniform sampler2D uG1;
uniform sampler2D uG2;
uniform sampler2D uG3;
uniform vec2 uSplatInv;
out vec4 outColor;
void main() {
  vec2 suv = ${splatUv};
  vec4 w = texture(uSplat, suv);
  vec4 wo = texture(uSplat2, suv);
  vec4 n = texture(uNoise, vGrid / ${f(NOISE_PERIOD_A)}) * 0.6 + texture(uNoise, vGrid / ${f(NOISE_PERIOD_B)}).bgra * 0.4;
  vec4 s = w + (n - 0.5) * ${f(SPLAT_NOISE_AMP)};
  vec2 no = texture(uNoise, vGrid / ${f(NOISE_PERIOD_C)}).rg * 0.6 + texture(uNoise, vGrid / ${f(NOISE_PERIOD_A)}).ba * 0.4;
  vec2 so = wo.rg + (no - 0.5) * ${f(SPLAT_NOISE_AMP)};
  s = pow(max(s, vec4(0.0)), vec4(${f(SPLAT_SHARPNESS)}));
  so = pow(max(so, vec2(0.0)), vec2(${f(SPLAT_SHARPNESS)}));
  float tot = max(dot(s, vec4(1.0)) + so.x + so.y, 1e-4);
  vec4 w2 = s / tot;
  vec2 wo2 = so / tot;
  vec2 uv = vGrid / ${f(TERRAIN_TEX_PERIOD_TILES)};
  vec3 c = w2.r * texture(uG0, uv).rgb + w2.g * texture(uG1, uv).rgb
         + w2.b * texture(uG2, uv).rgb + w2.a * texture(uG3, uv).rgb
         + wo2.x * texture(uWater, uv).rgb + wo2.y * texture(uForest, uv).rgb;
  outColor = vec4(c, 1.0);
}`;
}
