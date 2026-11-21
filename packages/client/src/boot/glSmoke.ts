// T0 smoke (ADR-006 risk #1): Pixi v8 on WebGL (SwiftShader in headless) drawing a Mesh with a custom
// GLSL ES 3.00 shader. Reports through `window.__glSmoke` and the console ("WEBGL2 OK").
import { Application, Geometry, GlProgram, Mesh, Shader } from 'pixi.js';

export interface GlSmokeResult {
  ok: boolean;
  webGLVersion: number;
  rendererName: string;
  error?: string;
}

const vertex = `#version 300 es
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

// Solid, easily detectable colours: checker of #ff0000 / #00ff00 on a 4x4 grid.
const fragment = `#version 300 es
precision mediump float;
in vec2 vGrid;
out vec4 outColor;
void main() {
  float c = mod(floor(vGrid.x * 4.0) + floor(vGrid.y * 4.0), 2.0);
  outColor = mix(vec4(1.0, 0.0, 0.0, 1.0), vec4(0.0, 1.0, 0.0, 1.0), c);
}`;

async function main(): Promise<GlSmokeResult> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const app = new Application();
  await app.init({
    canvas,
    width: 320,
    height: 240,
    preference: 'webgl',
    antialias: false,
    background: 0x000000,
    resolution: 1,
    autoDensity: false,
  });
  const geometry = new Geometry({
    attributes: {
      aPosition: [40, 40, 280, 40, 280, 200, 40, 200],
      aGrid: [0, 0, 1, 0, 1, 1, 0, 1],
    },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });
  const shader = new Shader({ glProgram: GlProgram.from({ vertex, fragment }), resources: {} });
  app.stage.addChild(new Mesh({ geometry, shader }));
  app.render();
  const gl = (app.renderer as unknown as { gl: WebGL2RenderingContext }).gl;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  const webGLVersion = (app.renderer as unknown as { context: { webGLVersion: number } }).context
    .webGLVersion;
  return { ok: webGLVersion === 2, webGLVersion, rendererName };
}

declare global {
  interface Window {
    __glSmoke?: GlSmokeResult;
  }
}

main().then(
  (r) => {
    window.__glSmoke = r;
    console.log(r.ok ? 'WEBGL2 OK' : 'WEBGL FALLBACK v' + r.webGLVersion, r.rendererName);
  },
  (e: unknown) => {
    window.__glSmoke = { ok: false, webGLVersion: 0, rendererName: '', error: String(e) };
    console.error('GL SMOKE FAIL', e);
  },
);
