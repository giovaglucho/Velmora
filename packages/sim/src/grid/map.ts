import type { MapSpec } from '@reinos/shared';
import { createGrid, type GridImpl } from './grid';

/**
 * Decodes blockedRle (alternating runs, starting with FREE) into the terrain layer. It is the
 * baseline: it does not bump `version`, but it marks every sector dirty so attached graphs rebuild.
 */
export function loadMap(grid: GridImpl, map: MapSpec): void {
  if (map.width !== grid.width || map.height !== grid.height)
    throw new RangeError('map size does not match the grid');
  const total = map.width * map.height;
  let pos = 0;
  let blocked = 0;
  for (let i = 0; i < map.blockedRle.length; i++) {
    const run = map.blockedRle[i] as number;
    if (!Number.isInteger(run) || run < 0 || pos + run > total)
      throw new RangeError('blockedRle runs exceed the map');
    if (blocked === 1) grid.terrain.fill(1, pos, pos + run);
    pos += run;
    blocked ^= 1;
  }
  if (pos !== total) throw new RangeError('blockedRle must sum to width*height');
  grid.markAllDirty();
}

/** GridFactory for createSim: builds the grid and decodes the map. */
export function createGridFromMap(map: MapSpec): GridImpl {
  const grid = createGrid(map.width, map.height);
  loadMap(grid, map);
  return grid;
}
