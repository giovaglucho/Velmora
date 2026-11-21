// Command application (ADR-005 §5). Runs at the first tick of a turn.
import { FX_HALF, TILE_FX, clamp, fxToTile, tileCenterFx } from '@reinos/shared';
import type { Command } from '@reinos/shared';
import { ORDER_MOVE, ORDER_NONE, PATH_IDLE, PATH_QUEUED, isAlive, type World } from '../ecs/index';
import type { Grid, MovementSystem } from '../systems';
import { isExecutable } from './validate';

const byPlayer = (a: Command, b: Command): number => a.playerId - b.playerId;
const ascending = (a: number, b: number): number => a - b;

/** Outcome counters of one command application (diagnostics only; never hashed). */
export interface ApplyStats {
  /** Commands rejected whole (malformed, wrong turn, bad player...). */
  rejected: number;
  /** Individual unit entries skipped inside accepted commands (foreign, dead, duplicate, no free goal). */
  skippedUnits: number;
}

/**
 * Applies the commands of `turn`; returns how many were rejected and how many unit entries were skipped. Valid commands are applied in
 * stable playerId order; each command's unit ids are deduplicated and processed ascending.
 * The caller's arrays are never mutated.
 */
export function applyCommands(
  w: World,
  grid: Grid,
  movement: MovementSystem,
  commands: readonly unknown[],
  turn: number,
  maxPlayers: number,
): ApplyStats {
  let rejected = 0;
  let skippedUnits = 0;
  const valid: Command[] = [];
  for (let k = 0; k < commands.length; k++) {
    const c = commands[k];
    if (isExecutable(c, turn, maxPlayers)) valid.push(c);
    else rejected++;
  }
  valid.sort(byPlayer); // Array.prototype.sort is stable: arrival order is kept within a player

  const cell = { tx: 0, ty: 0 };
  const maxX = grid.width * TILE_FX - FX_HALF;
  const maxY = grid.height * TILE_FX - FX_HALF;
  for (let k = 0; k < valid.length; k++) {
    const cmd = valid[k] as Command;
    const ids = cmd.unitIds.slice().sort(ascending);
    let goalX = 0;
    let goalY = 0;
    let goalOk = false;
    if (cmd.type === 'move' && cmd.target !== null) {
      goalX = clamp(cmd.target.x, FX_HALF, maxX);
      goalY = clamp(cmd.target.y, FX_HALF, maxY);
      if (grid.isBlocked(fxToTile(goalX), fxToTile(goalY))) {
        if (grid.nearestFree(fxToTile(goalX), fxToTile(goalY), cell)) {
          goalX = tileCenterFx(cell.tx);
          goalY = tileCenterFx(cell.ty);
          goalOk = true;
        }
      } else goalOk = true;
    }
    for (let j = 0; j < ids.length; j++) {
      const eid = ids[j] as number;
      if (j > 0 && eid === ids[j - 1]) {
        skippedUnits++; // duplicate
        continue;
      }
      if (!isAlive(w, eid)) {
        skippedUnits++;
        continue;
      }
      const i = eid & 0xffff;
      if (w.owner[i] !== cmd.playerId) {
        skippedUnits++;
        continue;
      }
      if (cmd.type === 'move') {
        if (!goalOk) {
          skippedUnits++; // no free tile anywhere: nothing to move to
          continue;
        }
        w.orderKind[i] = ORDER_MOVE;
        w.goalX[i] = goalX;
        w.goalY[i] = goalY;
        if (w.pathState[i] !== PATH_QUEUED) {
          w.pathState[i] = PATH_QUEUED;
          movement.enqueue(eid);
        }
        w.pathCount[i] = 0;
        w.pathIdx[i] = 0;
        w.stuck[i] = 0;
        w.repathAt[i] = 0;
      } else {
        w.orderKind[i] = ORDER_NONE;
        w.velX[i] = 0;
        w.velY[i] = 0;
        w.pathState[i] = PATH_IDLE; // a queued entry is invalidated: the queue checks QUEUED on dequeue
        w.pathCount[i] = 0;
        w.pathIdx[i] = 0;
      }
    }
  }
  return { rejected, skippedUnits };
}
