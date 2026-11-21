import { describe, expect, it } from 'vitest';
import {
  REPLAY_FORMAT_VERSION,
  serializeReplay,
  validateReplay,
  validateSimConfig,
  type Replay,
} from '../src/index';

function sample(): Replay {
  return {
    version: REPLAY_FORMAT_VERSION,
    seed: 4294967295,
    dataVersion: '0.2.0',
    config: {
      maxPlayers: 2,
      maxEntities: 64,
      map: { width: 4, height: 3, blockedRle: [5, 2, 5] },
      spawns: [
        { unit: 'colono', owner: 0, x: 500, y: 500 },
        { unit: 'recluta', owner: 1, x: 3500, y: 2500 },
      ],
    },
    totalTurns: 10,
    turns: [
      {
        n: 1,
        cmds: [
          {
            turn: 1,
            playerId: 1,
            type: 'move',
            unitIds: [65538, 65537],
            target: { kind: 'pos', x: 1500, y: 1500 },
            payload: null,
          },
          { turn: 1, playerId: 0, type: 'stop', unitIds: [65537], target: null, payload: null },
        ],
      },
      {
        n: 7,
        cmds: [
          {
            turn: 7,
            playerId: 0,
            type: 'move',
            unitIds: [65537],
            target: { kind: 'pos', x: 0, y: 512000 },
            payload: null,
          },
        ],
      },
    ],
    finalHash: 0xdeadbeef,
    checkpoints: [
      [5, 123],
      [10, 4294967295],
    ],
  };
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('replay roundtrip', () => {
  it('serialize -> JSON.parse -> validate is identical', () => {
    const r = sample();
    const text = serializeReplay(r);
    const back = validateReplay(JSON.parse(text));
    expect(back).toEqual(r);
    expect(serializeReplay(back)).toBe(text);
  });
  it('is byte-reproducible regardless of key construction order', () => {
    const r = sample();
    // rebuild every object with reversed key order
    const reverse = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(reverse);
      if (v && typeof v === 'object')
        return Object.fromEntries(
          Object.entries(v)
            .reverse()
            .map(([k, x]) => [k, reverse(x)]),
        );
      return v;
    };
    expect(serializeReplay(reverse(r) as Replay)).toBe(serializeReplay(r));
  });
  it('emits canonical key order and no whitespace', () => {
    const text = serializeReplay(sample());
    expect(text.startsWith('{"version":1,"seed":4294967295,"dataVersion":"0.2.0","config":{')).toBe(
      true,
    );
    expect(text).toContain(
      '"turns":[{"n":1,"cmds":[{"turn":1,"playerId":1,"type":"move","unitIds":',
    );
    expect(text).toContain('"target":{"kind":"pos","x":1500,"y":1500},"payload":null}');
    expect(text).not.toMatch(/\s/);
    expect(text.endsWith('"checkpoints":[[5,123],[10,4294967295]]}')).toBe(true);
  });
  it('checkpoints are optional', () => {
    const r = sample();
    delete r.checkpoints;
    const back = validateReplay(JSON.parse(serializeReplay(r)));
    expect(back.checkpoints).toBeUndefined();
    expect(Object.hasOwn(back, 'checkpoints')).toBe(false);
  });
  it('does not alias the input', () => {
    const r = sample();
    const v = validateReplay(r);
    v.turns[0]!.cmds[0]!.unitIds.push(1);
    expect(r.turns[0]!.cmds[0]!.unitIds.length).toBe(2);
  });
});

describe('validateReplay rejections', () => {
  const bad: [string, (r: Loose) => void, RegExp][] = [
    ['turns not ascending', (r) => (r.turns[1].n = 1), /replay\.turns\[1\]\.n.*ascending/],
    ['cmd.turn != n', (r) => (r.turns[0].cmds[1].turn = 2), /replay\.turns\[0\]\.cmds\[1\]\.turn/],
    ['n >= totalTurns', (r) => (r.totalTurns = 7), /replay\.turns\[1\]\.n/],
    ['n = totalTurns', (r) => (r.turns[1].n = 10), /replay\.turns\[1\]\.n/],
    ['non-integer seed', (r) => (r.seed = 1.5), /replay\.seed/],
    ['negative seed', (r) => (r.seed = -1), /replay\.seed/],
    ['seed > uint32', (r) => (r.seed = 4294967296), /replay\.seed/],
    ['non-integer finalHash', (r) => (r.finalHash = 0.5), /replay\.finalHash/],
    ['non-integer cmd field', (r) => (r.turns[0].cmds[0].target.x = 10.5), /cmds\[0\].*x/],
    ['NaN', (r) => (r.totalTurns = NaN), /replay\.totalTurns/],
    ['extra top-level key', (r) => (r.extra = 1), /unexpected key "extra"/],
    ['extra cmd key', (r) => (r.turns[0].cmds[0].extra = 1), /cmds\[0\]/],
    ['extra turn key', (r) => (r.turns[0].extra = 1), /replay\.turns\[0\]/],
    ['extra config key', (r) => (r.config.extra = 1), /replay\.config/],
    ['missing key', (r) => delete r.dataVersion, /missing key "dataVersion"/],
    ['wrong version', (r) => (r.version = 2), /replay\.version/],
    ['empty dataVersion', (r) => (r.dataVersion = ''), /replay\.dataVersion/],
    ['empty cmds', (r) => (r.turns[0].cmds = []), /replay\.turns\[0\]\.cmds/],
    ['payload not null', (r) => (r.turns[0].cmds[0].payload = {}), /payload/],
    ['unknown command type', (r) => (r.turns[0].cmds[0].type = 'attack'), /unknown type/],
    ['playerId out of range', (r) => (r.turns[0].cmds[0].playerId = 8), /playerId/],
    ['target x out of range', (r) => (r.turns[1].cmds[0].target.x = 512001), /x out of range/],
    ['stop with target', (r) => (r.turns[0].cmds[1].target = r.turns[0].cmds[0].target), /stop/],
    ['move without target', (r) => (r.turns[0].cmds[0].target = null), /pos target/],
    ['checkpoint not ascending', (r) => (r.checkpoints[1][0] = 5), /checkpoints\[1\]\[0\]/],
    ['checkpoint turn 0', (r) => (r.checkpoints[0][0] = 0), /checkpoints\[0\]\[0\]/],
    ['checkpoint hash float', (r) => (r.checkpoints[0][1] = 1.5), /checkpoints\[0\]\[1\]/],
    ['checkpoint wrong shape', (r) => (r.checkpoints[0] = [1]), /checkpoints\[0\]/],
    ['rle sum mismatch', (r) => (r.config.map.blockedRle = [5, 2, 4]), /blockedRle/],
    ['rle negative', (r) => (r.config.map.blockedRle = [6, -1, 7]), /blockedRle\[1\]/],
    ['map too large', (r) => (r.config.map.width = 513), /map\.width/],
    ['maxEntities 0', (r) => (r.config.maxEntities = 0), /maxEntities/],
    ['maxEntities 65536', (r) => (r.config.maxEntities = 65536), /maxEntities/],
    ['maxPlayers 9', (r) => (r.config.maxPlayers = 9), /maxPlayers/],
    ['spawn owner out of range', (r) => (r.config.spawns[0].owner = 2), /spawns\[0\]\.owner/],
    ['spawn coord negative', (r) => (r.config.spawns[1].y = -1), /spawns\[1\]\.y/],
    ['spawn unit not string', (r) => (r.config.spawns[0].unit = 3), /spawns\[0\]\.unit/],
  ];
  for (const [name, mutate, re] of bad)
    it(`rejects: ${name}`, () => {
      const r = clone(sample()) as Loose;
      mutate(r);
      expect(() => validateReplay(r)).toThrow(re);
      expect(() => serializeReplay(r as Replay)).toThrow();
    });
  it('rejects non-objects', () => {
    for (const v of [null, undefined, 1, 'x', [], true]) expect(() => validateReplay(v)).toThrow();
  });
  it('validateSimConfig accepts a minimal config', () => {
    expect(
      validateSimConfig({
        maxPlayers: 1,
        maxEntities: 1,
        map: { width: 1, height: 1, blockedRle: [1] },
        spawns: [],
      }),
    ).toEqual({
      maxPlayers: 1,
      maxEntities: 1,
      map: { width: 1, height: 1, blockedRle: [1] },
      spawns: [],
    });
  });
});
