// ADR-006 §6 — right click → `move` Command[] in the exact @reinos/shared format; `S` → `stop`.
// Feedback (marker) is immediate on the client and never waits for the sim.
import { MAX_CMD_UNITS, MAX_COORD_FX, TILE_FX, validateCommandShape } from '@reinos/shared';
import type { Command } from '@reinos/shared';
import type { SnapshotView } from '../worker/snapshot';
import type { Camera, Viewport } from '../render/types';
import type { InputGeometry } from './geometry';
import { isAliveEid } from './picking';

export interface CommandSink {
  send(cmds: Command[]): void;
}

/** Implemented by render/entities/markers (wired in I1): shows the order marker immediately. */
export interface OrderMarkerSink {
  showOrderMarker(fxX: number, fxY: number): void;
}

export interface MapSize {
  w: number;
  h: number;
}

/** Clamps an Fx target to the map and to the shared coordinate range. */
export function clampTargetFx(v: number, mapTiles: number): number {
  const max = Math.min(MAX_COORD_FX, mapTiles * TILE_FX - 1);
  return v < 0 ? 0 : v > max ? max : v;
}

function chunk(eids: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < eids.length; i += MAX_CMD_UNITS) out.push(eids.slice(i, i + MAX_CMD_UNITS));
  return out;
}

function validated(cmds: Command[]): Command[] {
  for (const c of cmds)
    if (!validateCommandShape(c)) throw new Error('internal: malformed command');
  return cmds;
}

/** `move` commands (turn 0: the host rewrites it), split into chunks of ≤ MAX_CMD_UNITS, eids ascending. */
export function buildMoveCommands(
  eids: readonly number[],
  playerId: number,
  targetFx: { x: number; y: number },
  map: MapSize,
): Command[] {
  const unique = Array.from(new Set(eids)).sort((a, b) => a - b);
  const x = clampTargetFx(Math.round(targetFx.x), map.w);
  const y = clampTargetFx(Math.round(targetFx.y), map.h);
  return validated(
    chunk(unique).map((unitIds) => ({
      turn: 0,
      playerId,
      type: 'move' as const,
      unitIds,
      target: { kind: 'pos' as const, x, y },
      payload: null,
    })),
  );
}

export function buildStopCommands(eids: readonly number[], playerId: number): Command[] {
  const unique = Array.from(new Set(eids)).sort((a, b) => a - b);
  return validated(
    chunk(unique).map((unitIds) => ({
      turn: 0,
      playerId,
      type: 'stop' as const,
      unitIds,
      target: null,
      payload: null,
    })),
  );
}

export interface OrderIssuerDeps {
  sink: CommandSink;
  marker?: OrderMarkerSink;
  geo: InputGeometry;
  localPlayer: () => number;
  getView: () => SnapshotView | null;
  getCamera: () => Camera;
  getViewport: () => Viewport;
  /** Current selection (ascending eids). */
  getSelection: () => readonly number[];
}

export class OrderIssuer {
  constructor(private readonly d: OrderIssuerDeps) {}

  /** Only own, live units obey: an enemy unit selected by click cannot be ordered. */
  private ownLive(view: SnapshotView): number[] {
    const me = this.d.localPlayer();
    return this.d
      .getSelection()
      .filter((e) => isAliveEid(view, e) && view.owner[e & 0xffff] === me);
  }

  /** Right click at screen (sx, sy): marker first (same frame), then the command. Returns what was sent. */
  moveToScreen(sx: number, sy: number): Command[] {
    const view = this.d.getView();
    if (!view) return [];
    const g = this.d.geo.screenToGrid(this.d.getCamera(), this.d.getViewport(), sx, sy);
    return this.moveToGrid(g.x, g.y);
  }

  /** Move to a grid point in tiles (also used by the minimap right click). */
  moveToGrid(gx: number, gy: number): Command[] {
    const view = this.d.getView();
    if (!view) return [];
    const map = { w: view.mapW, h: view.mapH };
    const x = clampTargetFx(this.d.geo.gridToFx(gx), map.w);
    const y = clampTargetFx(this.d.geo.gridToFx(gy), map.h);
    const units = this.ownLive(view);
    if (units.length === 0) return [];
    this.d.marker?.showOrderMarker(x, y);
    const cmds = buildMoveCommands(units, this.d.localPlayer(), { x, y }, map);
    this.d.sink.send(cmds);
    return cmds;
  }

  stop(): Command[] {
    const view = this.d.getView();
    if (!view) return [];
    const units = this.ownLive(view);
    if (units.length === 0) return [];
    const cmds = buildStopCommands(units, this.d.localPlayer());
    this.d.sink.send(cmds);
    return cmds;
  }
}
