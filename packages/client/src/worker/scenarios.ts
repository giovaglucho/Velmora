// ADR-006 §2 / plan W3 — demo scenarios (geometry only, no balance numbers). Owner: sim-engineer (W3).
// Integer-only and driven by a scenario PRNG (outside the sim), so the same (name, seed) always yields
// the same SimConfig. Unit ids refer to units.json; their stats come from the data package.
import { createPrng, tileCenterFx, type SimConfig, type SpawnSpec } from '@reinos/shared';

export type ScenarioName = 'demo100' | 'demo200' | 'demo400';
export const SCENARIO_NAMES: readonly ScenarioName[] = ['demo100', 'demo200', 'demo400'];

const MAP_SIDE = 128;
const MAX_ENTITIES = 1024;
/** Per-player army: columns x rows on a one-tile grid (rows cycle through UNIT_ROWS). */
const ARMY: Readonly<Record<ScenarioName, { cols: number; rows: number }>> = {
  demo100: { cols: 10, rows: 5 },
  // 100 OWN units per player (K6: box-select 100 units); 200 in total.
  demo200: { cols: 10, rows: 10 },
  demo400: { cols: 20, rows: 10 },
};
const UNIT_ROWS: readonly string[] = ['recluta', 'arquero', 'jinete_ligero'];
/** Free margin (tiles) kept around each army so obstacles never block a spawn. */
const SPAWN_PAD = 4;
const LAKES = 6;
const FOREST_CLUMPS = 40;

/** Client-only obstacle classes (presentation; the sim only knows "blocked"). 0 = free. */
export const OBSTACLE_FREE = 0;
export const OBSTACLE_LAKE = 1;
export const OBSTACLE_FOREST = 2;

export function isScenarioName(s: string): s is ScenarioName {
  return (SCENARIO_NAMES as readonly string[]).includes(s);
}

function blockedBitmap(
  cols: number,
  rows: number,
  armyY: number,
  rightX: number,
  seed: number,
): Uint8Array {
  const prng = createPrng(seed);
  const blocked = new Uint8Array(MAP_SIDE * MAP_SIDE);
  const inSpawnZone = (x: number, y: number): boolean => {
    const inY = y >= armyY - SPAWN_PAD && y < armyY + rows + SPAWN_PAD;
    return (
      inY &&
      ((x >= 8 - SPAWN_PAD && x < 8 + cols + SPAWN_PAD) ||
        (x >= rightX - SPAWN_PAD && x < rightX + cols + SPAWN_PAD))
    );
  };
  const disc = (cx: number, cy: number, rx: number, ry: number, kindOfDisc: number): void => {
    for (let y = cy - ry; y <= cy + ry; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (x < 0 || y < 0 || x >= MAP_SIDE || y >= MAP_SIDE || inSpawnZone(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx * ry * ry + dy * dy * rx * rx <= rx * rx * ry * ry) {
          const i = y * MAP_SIDE + x;
          // Lakes win over overlapping forests; the blocked SET is identical to the pre-classification one.
          if (kindOfDisc === OBSTACLE_LAKE || blocked[i] === OBSTACLE_FREE) blocked[i] = kindOfDisc;
        }
      }
  };
  // Lakes: large ellipses in the central band (always created in the same PRNG order).
  for (let i = 0; i < LAKES; i++) {
    const cx = 36 + prng.nextInt(56);
    const cy = 8 + prng.nextInt(MAP_SIDE - 16);
    disc(cx, cy, 3 + prng.nextInt(5), 3 + prng.nextInt(6), OBSTACLE_LAKE);
  }
  // Forests: small clumps anywhere.
  for (let i = 0; i < FOREST_CLUMPS; i++) {
    const cx = 2 + prng.nextInt(MAP_SIDE - 4);
    const cy = 2 + prng.nextInt(MAP_SIDE - 4);
    disc(cx, cy, 1 + prng.nextInt(3), 1 + prng.nextInt(3), OBSTACLE_FOREST);
  }
  return blocked;
}

/** Free-first alternating run lengths in row-major order (SimConfig.map.blockedRle). */
function toRle(blocked: Uint8Array): number[] {
  const runs: number[] = [];
  let cur = 0;
  let len = 0;
  for (let i = 0; i < blocked.length; i++) {
    const b = blocked[i] === OBSTACLE_FREE ? 0 : 1;
    if (b === cur) len++;
    else {
      runs.push(len);
      cur = b;
      len = 1;
    }
  }
  runs.push(len);
  return runs;
}

function scenarioObstacles(name: ScenarioName, seed: number): Uint8Array {
  const army = ARMY[name];
  const armyY = Math.trunc((MAP_SIDE - army.rows) / 2);
  const rightX = MAP_SIDE - 8 - army.cols;
  return blockedBitmap(army.cols, army.rows, armyY, rightX, seed);
}

/**
 * Client-only terrain classes of the blocked tiles (row-major, length W*H: OBSTACLE_FREE / LAKE / FOREST).
 * Presentation data for the renderer; never part of SimConfig nor the hash. A tile is non-free iff the
 * sim sees it as blocked in `buildScenario(name, seed).map.blockedRle`.
 */
export function buildScenarioObstacles(name: ScenarioName, seed: number): Uint8Array {
  return scenarioObstacles(name, seed);
}

export function buildScenario(name: ScenarioName, seed: number): SimConfig {
  const army = ARMY[name];
  const armyY = Math.trunc((MAP_SIDE - army.rows) / 2);
  const rightX = MAP_SIDE - 8 - army.cols;
  const blocked = scenarioObstacles(name, seed);
  const spawns: SpawnSpec[] = [];
  for (let owner = 0; owner < 2; owner++) {
    const x0 = owner === 0 ? 8 : rightX;
    for (let r = 0; r < army.rows; r++)
      for (let c = 0; c < army.cols; c++)
        spawns.push({
          unit: UNIT_ROWS[r % UNIT_ROWS.length] as string,
          owner,
          x: tileCenterFx(x0 + c),
          y: tileCenterFx(armyY + r),
        });
  }
  return {
    maxPlayers: 2,
    maxEntities: MAX_ENTITIES,
    map: { width: MAP_SIDE, height: MAP_SIDE, blockedRle: toRle(blocked) },
    spawns,
  };
}
