import { describe, expect, it } from 'vitest';
import {
  COMMAND_CODE,
  MAX_CMD_UNITS,
  commandShapeError,
  validateCommandShape,
  type Command,
} from '../src/index';

const move = (): Command => ({
  turn: 3,
  playerId: 0,
  type: 'move',
  unitIds: [65537],
  target: { kind: 'pos', x: 1000, y: 2000 },
  payload: null,
});
const stop = (): Command => ({
  turn: 0,
  playerId: 7,
  type: 'stop',
  unitIds: [1, 2],
  target: null,
  payload: null,
});

describe('validateCommandShape', () => {
  it('accepts well-formed commands and borders', () => {
    expect(validateCommandShape(move())).toBe(true);
    expect(validateCommandShape(stop())).toBe(true);
    const m = move();
    m.target = { kind: 'pos', x: 0, y: 512000 };
    expect(validateCommandShape(m)).toBe(true);
    m.unitIds = Array.from({ length: MAX_CMD_UNITS }, (_, i) => i);
    expect(validateCommandShape(m)).toBe(true);
  });
  it('has stable command codes', () => {
    expect(COMMAND_CODE).toEqual({ move: 1, stop: 2 });
  });
  const cases: [string, (c: Record<string, any>) => void][] = [
    // eslint-disable-line @typescript-eslint/no-explicit-any
    ['float turn', (c) => (c.turn = 1.5)],
    ['negative turn', (c) => (c.turn = -1)],
    ['string turn', (c) => (c.turn = '1')],
    ['playerId 8', (c) => (c.playerId = 8)],
    ['playerId -1', (c) => (c.playerId = -1)],
    ['unknown type', (c) => (c.type = 'attack')],
    ['empty unitIds', (c) => (c.unitIds = [])],
    ['too many unitIds', (c) => (c.unitIds = new Array(MAX_CMD_UNITS + 1).fill(1))],
    ['float unitId', (c) => (c.unitIds = [1.5])],
    ['negative unitId', (c) => (c.unitIds = [-1])],
    ['unitId > 2^31', (c) => (c.unitIds = [2 ** 31])],
    ['sparse unitIds', (c) => (c.unitIds = new Array(3))],
    ['unitIds not array', (c) => (c.unitIds = 5)],
    ['payload not null', (c) => (c.payload = 0)],
    ['payload undefined', (c) => (c.payload = undefined)],
    ['target x float', (c) => (c.target.x = 0.5)],
    ['target x too big', (c) => (c.target.x = 512001)],
    ['target y negative', (c) => (c.target.y = -1)],
    ['target kind', (c) => (c.target.kind = 'entity')],
    ['target extra key', (c) => (c.target.z = 1)],
    ['extra key', (c) => (c.extra = 1)],
    ['missing key', (c) => delete c.payload],
    ['NaN', (c) => (c.turn = NaN)],
    ['Infinity', (c) => (c.turn = Infinity)],
  ];
  for (const [name, mutate] of cases)
    it(`rejects: ${name}`, () => {
      const c = JSON.parse(JSON.stringify(move()));
      if (name === 'payload undefined' || name === 'sparse unitIds') {
        const m = move() as unknown as Record<string, unknown>;
        mutate(m);
        expect(validateCommandShape(m)).toBe(false);
        return;
      }
      mutate(c);
      expect(validateCommandShape(c)).toBe(false);
      expect(commandShapeError(c)).not.toBeNull();
    });
  it('rejects move without target / stop with target / non-objects', () => {
    expect(validateCommandShape({ ...move(), target: null })).toBe(false);
    expect(validateCommandShape({ ...stop(), target: { kind: 'pos', x: 0, y: 0 } })).toBe(false);
    for (const v of [null, undefined, 3, 'x', [], () => 0])
      expect(validateCommandShape(v)).toBe(false);
  });
});
