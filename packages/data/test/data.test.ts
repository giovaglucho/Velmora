import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  bundledRaw,
  crossCheck,
  loadGameData,
  parseSchemas,
  toFixed,
  UnitDef,
  DATA_VERSION,
  type RawGameData,
} from '../src/index.js';

const clone = <T>(v: T): T => structuredClone(v);
const data = loadGameData();
const unit = (id: string) => data.units.find((u) => u.id === id)!;
const building = (id: string) => data.buildings.find((b) => b.id === id)!;
const tech = (id: string) => data.techs.find((t) => t.id === id)!;

describe('valid data', () => {
  it('loads and cross-validates the bundled JSON', () => {
    expect(data.units.length).toBeGreaterThan(40);
    expect(data.factions.map((f) => f.id).sort()).toEqual([
      'casa_valdren',
      'clanes_skjald',
      'concordia_tessaline',
      'sultanato_de_azhar',
    ]);
    expect(crossCheck(data).errors).toEqual([]);
    expect(DATA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('bundled loader covers every JSON file on disk', () => {
    const root = join(__dirname, '..', 'json');
    expect(readdirSync(join(root, 'factions')).length).toBe(
      Object.keys(bundledRaw.factions).length,
    );
    expect(readdirSync(join(root, 'maps')).length).toBe(Object.keys(bundledRaw.maps).length);
  });
  it('fixedScale convention', () => {
    expect(data.economy.fixedScale).toBe(1000);
    expect(toFixed(0.8)).toBe(800);
    expect(toFixed(1.35)).toBe(1350);
  });
});

describe('GDD spot checks', () => {
  it('Colono: 50 food, 25 s, 25 HP, speed 0.8 (GDD 4.2)', () => {
    const c = unit('colono');
    expect(c.cost).toEqual({ food: 50 });
    expect(c.trainTime).toBe(25);
    expect(c.hp).toBe(25);
    expect(c.speed).toBe(0.8);
    expect(c.los).toBe(4);
    expect(c.attacks).toEqual({ melee: 3 });
    expect(data.economy.settler.carry).toEqual({ default: 10, hunt: 35 });
    expect(data.economy.settler.startUnits).toEqual({ colono: 3, batidor: 1 });
  });
  it('Ciudadela 275 wood 100 stone (GDD 6)', () => {
    const b = building('ciudadela');
    expect(b.cost).toEqual({ wood: 275, stone: 100 });
    expect(b.buildTime).toBe(150);
    expect(b.hp['1']).toBe(2400);
    expect(b.garrison).toBe(15);
    expect(b.size).toEqual({ w: 4, h: 4 });
  });
  it('Era II costs 500 food, 130 s (GDD 5)', () => {
    const a = data.ages.ages.find((x) => x.age === 2)!;
    expect(a.cost).toEqual({ food: 500 });
    expect(a.researchTime).toBe(130);
    const a3 = data.ages.ages[2]!,
      a4 = data.ages.ages[3]!;
    expect([a3.cost, a3.researchTime]).toEqual([{ food: 800, aether: 200 }, 160]);
    expect([a4.cost, a4.researchTime]).toEqual([{ food: 1000, aether: 800 }, 190]);
  });
  it('Caballero matches the 18.1 sample', () => {
    const k = unit('caballero');
    expect(k).toMatchObject({
      building: 'establo',
      age: 3,
      cost: { food: 60, aether: 75 },
      trainTime: 30,
      hp: 100,
      speed: 1.35,
      los: 4,
      reload: 1.8,
      attacks: { melee: 10 },
      classes: ['cavalry'],
      upgradesTo: 'caballero_real',
    });
    expect(k.armors).toMatchObject({ melee: 2, pierce: 2 });
  });
  it('ambiguous range rows expand to one entry per variant', () => {
    expect(['lancero', 'piquero', 'alabardero'].map((i) => unit(i).hp)).toEqual([45, 55, 60]);
    expect(['lancero', 'piquero', 'alabardero'].map((i) => unit(i).attacks.melee)).toEqual([
      3, 4, 6,
    ]);
    expect(unit('alabardero').notes).toContain('AMBIGUO');
    expect(unit('ariete').notes).toContain('AMBIGUO');
  });
  it('upgrades and eco techs', () => {
    expect(data.upgrades.find((u) => u.id === 'up_espada_larga')).toMatchObject({
      cost: { food: 200, aether: 65 },
      researchTime: 45,
    });
    expect(data.upgrades.find((u) => u.id === 'up_caballero_real')).toMatchObject({
      cost: { food: 300, aether: 300 },
      researchTime: 100,
    });
    expect(tech('carretilla')).toMatchObject({
      cost: { food: 175, wood: 50 },
      researchTime: 75,
      age: 2,
    });
  });
  it('faction exclusions and map script', () => {
    const v = data.factions.find((f) => f.id === 'casa_valdren')!;
    expect(v.disabledUnits).toEqual(['arcabucero_de_eter', 'galeon_de_eter']);
    const m = data.maps[0]!;
    expect(m.id).toBe('llanuras_de_ceniza');
    expect(m.forests.size).toEqual([30, 80]);
    expect(m.objects).toHaveLength(4);
  });
  it('difficulties (GDD 12.3)', () => {
    const d = Object.fromEntries(data.ai.difficulties.difficulties.map((x) => [x.id, x]));
    expect(d.aprendiz).toMatchObject({ reactionDelay: 4, economyBonusPct: -50 });
    expect(d.despiadada).toMatchObject({ reactionDelay: 0.2, economyBonusPct: 20, micro: 'full' });
  });
});

describe('broken data fails', () => {
  it('schema violation throws', () => {
    const raw: RawGameData = clone(bundledRaw);
    (raw.units as { units: { hp: unknown }[] }).units[0]!.hp = 'lots';
    expect(() => parseSchemas(raw)).toThrow();
    expect(() => loadGameData(raw)).toThrow();
  });
  it('unknown field is rejected (strict)', () => {
    const u = clone(unit('colono')) as Record<string, unknown>;
    u.mystery = 1;
    expect(UnitDef.safeParse(u).success).toBe(false);
  });
  it('dangling upgradesTo is a cross-reference error', () => {
    const raw: RawGameData = clone(bundledRaw);
    (raw.units as { units: { id: string; upgradesTo?: string }[] }).units.find(
      (u) => u.id === 'caballero',
    )!.upgradesTo = 'no_existe';
    const r = crossCheck(parseSchemas(raw));
    expect(r.errors.some((e) => e.includes('no_existe'))).toBe(true);
    expect(() => loadGameData(raw)).toThrow(/no_existe/);
  });
  it('unknown building / tech target / faction ref are caught', () => {
    const raw: RawGameData = clone(bundledRaw);
    (raw.units as { units: { id: string; building: string }[] }).units.find(
      (u) => u.id === 'colono',
    )!.building = 'nada';
    (raw.techs as { techs: { id: string; effects: { target: string }[] }[] }).techs.find(
      (t) => t.id === 'linajes',
    )!.effects[0]!.target = 'unit:fantasma';
    (raw.factions['casa_valdren'] as { disabledTechs: string[] }).disabledTechs = ['tech_fantasma'];
    const errs = crossCheck(parseSchemas(raw)).errors.join('\n');
    expect(errs).toContain('unknown building "nada"');
    expect(errs).toContain('unknown unit "fantasma"');
    expect(errs).toContain('tech_fantasma');
  });
  it('i18n key mismatch is caught', () => {
    const raw: RawGameData = clone(bundledRaw);
    delete (raw.i18n.en as { strings: Record<string, string> }).strings['app.title'];
    expect(crossCheck(parseSchemas(raw)).errors.join()).toContain('app.title');
  });
});
