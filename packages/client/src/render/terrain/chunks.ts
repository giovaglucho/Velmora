// ADR-006 §4.6 — one mesh per 16×16 chunk, culled; all chunks share ONE shader (1 draw call per visible chunk).
// Owner: render-engineer (R2). Pixi allowed.
import { Container, Geometry, GlProgram, Mesh, Shader, UniformGroup } from 'pixi.js';
import { CHUNK_TILES } from '../constants';
import { gridToWorld } from '../iso';
import { visibleChunks } from '../culling';
import type { TileRange } from '../types';
import { splatFragment, TERRAIN_VERT } from './splat.frag.glsl';
import type { TerrainMap } from './terrainMap';
import { buildHardSplat } from './terrainMap';
import { createSplatTexture, type TerrainTextures } from './textures';

export interface TerrainViewOptions {
  /** Negative control for the seam metric: independent tiles with hard borders. */
  hardTiles?: boolean;
}

export class TerrainView {
  readonly chunksX: number;
  readonly chunksY: number;
  private readonly meshes: Array<Mesh<Geometry, Shader>> = [];
  private readonly shown: Uint8Array;
  private readonly ownedSplat;
  private readonly ownedSplat2;

  constructor(
    readonly container: Container,
    readonly map: TerrainMap,
    textures: TerrainTextures,
    opts: TerrainViewOptions = {},
  ) {
    const { width: W, height: H } = map;
    this.chunksX = Math.ceil(W / CHUNK_TILES);
    this.chunksY = Math.ceil(H / CHUNK_TILES);
    this.shown = new Uint8Array(this.chunksX * this.chunksY);

    const hard = opts.hardTiles === true;
    const hardData = hard ? buildHardSplat(map.kind, W, H) : null;
    this.ownedSplat = createSplatTexture(hardData?.splat ?? map.splat, W, H, hard);
    this.ownedSplat2 = createSplatTexture(hardData?.splat2 ?? map.splat2, W, H, hard);
    const uniforms = new UniformGroup({
      uSplatInv: { value: new Float32Array([1 / (W + 1), 1 / (H + 1)]), type: 'vec2<f32>' },
    });
    const shader = new Shader({
      glProgram: GlProgram.from({
        vertex: TERRAIN_VERT,
        fragment: splatFragment(hard),
        name: hard ? 'terrain-splat-hard' : 'terrain-splat',
      }),
      resources: {
        terrainUniforms: uniforms,
        uSplat: this.ownedSplat.source,
        uSplat2: this.ownedSplat2.source,
        uWater: textures.water.source,
        uForest: textures.forest.source,
        uNoise: textures.noise.source,
        uG0: textures.ground[0].source,
        uG1: textures.ground[1].source,
        uG2: textures.ground[2].source,
        uG3: textures.ground[3].source,
      },
    });

    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const x0 = cx * CHUNK_TILES;
        const y0 = cy * CHUNK_TILES;
        const x1 = Math.min(W, x0 + CHUNK_TILES);
        const y1 = Math.min(H, y0 + CHUNK_TILES);
        const p = [
          gridToWorld(x0, y0),
          gridToWorld(x1, y0),
          gridToWorld(x1, y1),
          gridToWorld(x0, y1),
        ];
        const geometry = new Geometry({
          attributes: {
            aPosition: new Float32Array([
              p[0]!.x,
              p[0]!.y,
              p[1]!.x,
              p[1]!.y,
              p[2]!.x,
              p[2]!.y,
              p[3]!.x,
              p[3]!.y,
            ]),
            aGrid: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]),
          },
          indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
        });
        const mesh = new Mesh<Geometry, Shader>({ geometry, shader });
        mesh.visible = false;
        container.addChild(mesh);
        this.meshes.push(mesh);
      }
    }
  }

  /** Shows only the chunks covering `range` (tile range). Returns the number of visible chunks. */
  update(range: TileRange): number {
    const c = visibleChunks(range);
    let n = 0;
    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const i = cy * this.chunksX + cx;
        const vis = cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1 ? 1 : 0;
        n += vis;
        if (this.shown[i] !== vis) {
          this.shown[i] = vis;
          this.meshes[i]!.visible = vis === 1;
        }
      }
    }
    return n;
  }

  dispose(): void {
    for (const m of this.meshes) m.destroy();
    this.meshes.length = 0;
    this.ownedSplat.destroy(true);
    this.ownedSplat2.destroy(true);
  }
}
