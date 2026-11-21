import { z } from 'zod';
import {
  AgesFile,
  BuildingsFile,
  CombatFile,
  DifficultiesFile,
  AiLayersFile,
  AiRulesFile,
  EconomyFile,
  FactionDef,
  GameFile,
  I18nFile,
  MapScript,
  ResourcesFile,
  TechsFile,
  UnitsFile,
  UpgradesFile,
  UnitClass,
  type Modifier,
} from './schemas/index.js';

export interface RawGameData {
  resources: unknown;
  economy: unknown;
  ages: unknown;
  units: unknown;
  buildings: unknown;
  techs: unknown;
  upgrades: unknown;
  combat: unknown;
  game: unknown;
  factions: Record<string, unknown>;
  maps: Record<string, unknown>;
  ai: { difficulties: unknown; layers: unknown; rules: unknown };
  i18n: { es: unknown; en: unknown };
}

export function parseSchemas(raw: RawGameData) {
  return {
    resources: ResourcesFile.parse(raw.resources),
    economy: EconomyFile.parse(raw.economy),
    ages: AgesFile.parse(raw.ages),
    units: UnitsFile.parse(raw.units).units,
    buildings: BuildingsFile.parse(raw.buildings).buildings,
    techs: TechsFile.parse(raw.techs).techs,
    upgrades: UpgradesFile.parse(raw.upgrades).upgrades,
    combat: CombatFile.parse(raw.combat),
    game: GameFile.parse(raw.game),
    factions: Object.values(raw.factions).map((f) => FactionDef.parse(f)),
    maps: Object.values(raw.maps).map((m) => MapScript.parse(m)),
    ai: {
      difficulties: DifficultiesFile.parse(raw.ai.difficulties),
      layers: AiLayersFile.parse(raw.ai.layers),
      rules: AiRulesFile.parse(raw.ai.rules),
    },
    i18n: { es: I18nFile.parse(raw.i18n.es), en: I18nFile.parse(raw.i18n.en) },
  };
}
export type GameData = ReturnType<typeof parseSchemas>;

const TARGET_GROUPS = new Set(['all', 'towers', 'walls']);
const RESOURCES = new Set(['food', 'wood', 'aether', 'stone']);

/** Cross-reference checks. Returns hard errors and soft warnings (data the GDD leaves pending). */
export function crossCheck(d: GameData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(`${kind}: duplicate id "${id}"`);
      seen.add(id);
    }
    return seen;
  };
  const unitIds = dup(
    'units',
    d.units.map((u) => u.id),
  );
  const buildingIds = dup(
    'buildings',
    d.buildings.map((b) => b.id),
  );
  const techIds = dup(
    'techs',
    d.techs.map((t) => t.id),
  );
  const upgradeIds = dup(
    'upgrades',
    d.upgrades.map((u) => u.id),
  );
  const factionIds = dup(
    'factions',
    d.factions.map((f) => f.id),
  );
  dup(
    'maps',
    d.maps.map((m) => m.id),
  );
  dup(
    'economy.sources',
    d.economy.sources.map((s) => s.id),
  );
  const sourceIds = new Set(d.economy.sources.map((s) => s.id));
  const lines = new Set(d.units.map((u) => u.line));
  const buildingUpgradeIds = new Set(
    d.upgrades.filter((u) => u.kind === 'building').map((u) => u.id),
  );
  const bAge = new Map(d.buildings.map((b) => [b.id, b.age]));
  const uById = new Map(d.units.map((u) => [u.id, u]));

  const checkSelector = (where: string, sel: string) => {
    const [kind, id] = sel.split(':') as [string, string | undefined];
    if (kind === 'global') return;
    if (!id) {
      err(`${where}: selector "${sel}" has no id`);
      return;
    }
    if (kind === 'unit' && !unitIds.has(id)) err(`${where}: unknown unit "${id}"`);
    else if (kind === 'line' && !lines.has(id)) err(`${where}: unknown line "${id}"`);
    else if (kind === 'class' && !UnitClass.safeParse(id).success)
      err(`${where}: unknown class "${id}"`);
    else if (kind === 'building' && !buildingIds.has(id)) err(`${where}: unknown building "${id}"`);
    else if (kind === 'buildings' && !TARGET_GROUPS.has(id))
      err(`${where}: unknown building group "${id}"`);
    else if (kind === 'resource' && !RESOURCES.has(id)) err(`${where}: unknown resource "${id}"`);
  };
  const checkMods = (where: string, mods: Modifier[]) =>
    mods.forEach((m, i) => checkSelector(`${where}.effects[${i}]`, m.target));

  // units
  for (const u of d.units) {
    if (!buildingIds.has(u.building)) err(`unit ${u.id}: unknown building "${u.building}"`);
    else if ((bAge.get(u.building) ?? 0) > u.age)
      err(
        `unit ${u.id}: age ${u.age} earlier than building ${u.building} (age ${bAge.get(u.building)})`,
      );
    if (u.upgradesTo) {
      const to = uById.get(u.upgradesTo);
      if (!to) err(`unit ${u.id}: upgradesTo "${u.upgradesTo}" does not exist`);
      else {
        if (to.age < u.age) err(`unit ${u.id}: upgradesTo ${to.id} has lower age`);
        if (to.line !== u.line) err(`unit ${u.id}: upgradesTo ${to.id} is in another line`);
      }
    }
  }
  // buildings
  for (const b of d.buildings)
    if (b.requiresTech && !techIds.has(b.requiresTech))
      err(`building ${b.id}: unknown requiresTech "${b.requiresTech}"`);
  // techs
  for (const t of d.techs) {
    if (!buildingIds.has(t.building)) err(`tech ${t.id}: unknown building "${t.building}"`);
    else if ((bAge.get(t.building) ?? 0) > t.age)
      err(`tech ${t.id}: age ${t.age} earlier than building ${t.building}`);
    for (const r of t.requires ?? [])
      if (!techIds.has(r)) err(`tech ${t.id}: unknown requires "${r}"`);
    if (t.faction && !factionIds.has(t.faction))
      err(`tech ${t.id}: unknown faction "${t.faction}"`);
    checkMods(`tech ${t.id}`, t.effects);
    if (!t.cost && !t.faction) err(`tech ${t.id}: missing cost`);
    if (!t.cost) warnings.push(`tech ${t.id}: cost pending in GDD`);
  }
  // upgrades
  for (const up of d.upgrades) {
    if (up.kind === 'unit') {
      const from = uById.get(up.from);
      if (!from) err(`upgrade ${up.id}: unknown from unit "${up.from}"`);
      if (!up.to || !unitIds.has(up.to)) err(`upgrade ${up.id}: unknown to unit "${up.to}"`);
      else if (from && from.upgradesTo !== up.to)
        err(`upgrade ${up.id}: ${up.from}.upgradesTo is "${from.upgradesTo}", not "${up.to}"`);
      if (up.building && !buildingIds.has(up.building))
        err(`upgrade ${up.id}: unknown building "${up.building}"`);
    } else if (!buildingIds.has(up.from) && !buildingUpgradeIds.has(up.from))
      err(`upgrade ${up.id}: unknown from building "${up.from}"`);
    if (!up.cost) warnings.push(`upgrade ${up.id}: cost pending in GDD`);
  }
  for (const u of d.units)
    if (u.upgradesTo && !d.upgrades.some((x) => x.kind === 'unit' && x.from === u.id))
      err(`unit ${u.id}: no upgrade entry for upgradesTo`);
  void upgradeIds;
  // ages
  for (const a of d.ages.ages) {
    for (const r of a.requirements)
      for (const b of r.buildings)
        if (!buildingIds.has(b)) err(`age ${a.id}: unknown building "${b}"`);
    for (const b of a.excludedBuildings)
      if (!buildingIds.has(b)) err(`age ${a.id}: unknown excluded building "${b}"`);
  }
  d.ages.ages.forEach((a, i) => {
    if (a.age !== i + 1) err(`age ${a.id}: expected age ${i + 1}`);
  });
  for (const b of d.ages.implicit.armorExemptBuildings)
    if (!buildingIds.has(b)) err(`ages.implicit: unknown exempt building "${b}"`);
  for (const b of Object.keys(d.ages.implicit.buildingHpByAge))
    if (!buildingIds.has(b)) err(`ages.implicit: unknown building "${b}"`);
  if (!lines.has(d.ages.implicit.scoutUnitLine)) err(`ages.implicit: unknown scoutUnitLine`);
  for (const h of d.ages.implicit.hiddenUnitUpgrades)
    if (!unitIds.has(h.unit)) err(`ages.implicit: unknown unit "${h.unit}"`);
  // economy
  if (!unitIds.has(d.economy.settler.unit)) err('economy.settler.unit unknown');
  for (const id of Object.keys(d.economy.settler.startUnits))
    if (!unitIds.has(id)) err(`economy.settler.startUnits: unknown unit "${id}"`);
  if (!unitIds.has(d.economy.tradeCart.unit)) err('economy.tradeCart.unit unknown');
  for (const g of d.economy.gatherRates)
    if (Math.abs(g.perSecond * 60 - g.perMinute) > 0.051)
      err(`economy.gatherRates ${g.id}: perMinute ${g.perMinute} != perSecond*60`);
  for (const s of d.economy.sources)
    if (s.requires && !buildingIds.has(s.requires))
      err(`economy.sources ${s.id}: unknown building "${s.requires}"`);
  // factions
  for (const f of d.factions) {
    const w = `faction ${f.id}`;
    for (const id of f.disabledUnits)
      if (!unitIds.has(id)) err(`${w}: unknown disabled unit "${id}"`);
    for (const id of f.disabledTechs)
      if (!techIds.has(id)) err(`${w}: unknown disabled tech "${id}"`);
    for (const k of ['castle', 'aether'] as const) {
      const t = d.techs.find((x) => x.id === f.uniqueTechs[k]);
      if (!t) err(`${w}: unknown unique tech "${f.uniqueTechs[k]}"`);
      else if (t.faction !== f.id)
        err(`${w}: unique tech ${t.id} belongs to faction "${t.faction}"`);
      else if (t.age !== (k === 'castle' ? 3 : 4))
        err(`${w}: unique tech ${t.id} age ${t.age} does not match slot ${k}`);
    }
    if (!buildingIds.has(f.uniqueUnit.building)) err(`${w}: unknown unique unit building`);
    for (const b of [...f.bonuses, f.teamBonus]) {
      checkMods(`${w} bonus ${b.id}`, b.modifiers);
      for (const t of b.grantsTech ?? [])
        if (!techIds.has(t)) err(`${w} bonus ${b.id}: unknown grantsTech "${t}"`);
    }
  }
  // techs with faction must be listed as unique tech by that faction
  for (const t of d.techs)
    if (
      t.faction &&
      !d.factions.some((f) => f.uniqueTechs.castle === t.id || f.uniqueTechs.aether === t.id)
    )
      err(`tech ${t.id}: faction tech not referenced by its faction`);
  // maps
  for (const m of d.maps)
    for (const o of m.objects)
      if (!sourceIds.has(o.type)) err(`map ${m.id}: unknown object type "${o.type}"`);
  for (const p of d.game.mapPool)
    if (p.scriptAvailable && !d.maps.some((m) => m.id === p.id))
      err(`game.mapPool ${p.id}: scriptAvailable but no maps/${p.id}.json`);
  // combat
  for (const a of d.combat.areaDamage)
    if (!a.unitPending && !unitIds.has(a.unit))
      err(`combat.areaDamage ${a.id}: unknown unit "${a.unit}"`);
  // ai
  const calib = d.ai.difficulties.calibration;
  const diffIds = new Set(d.ai.difficulties.difficulties.map((x) => x.id));
  for (const c of calib)
    if (!diffIds.has(c.difficulty)) err(`ai.calibration: unknown difficulty "${c.difficulty}"`);
  for (const l of d.ai.layers.layers)
    if (l.minDifficulty && !diffIds.has(l.minDifficulty))
      err(`ai.layers ${l.id}: unknown minDifficulty`);
  d.ai.rules.rules.forEach((r, i) => {
    for (const s of [...r.when, ...r.do]) {
      for (const m of s.matchAll(/(?:train|canTrain)\('([a-z_]+)'\)/g))
        if (!unitIds.has(m[1]!)) err(`ai.rules[${i}]: unknown unit "${m[1]}"`);
      for (const m of s.matchAll(/idleQueue\('([a-z_]+)'\)/g))
        if (!buildingIds.has(m[1]!)) err(`ai.rules[${i}]: unknown building "${m[1]}"`);
    }
  });
  // i18n parity
  const es = Object.keys(d.i18n.es.strings),
    en = new Set(Object.keys(d.i18n.en.strings));
  for (const k of es) if (!en.has(k)) err(`i18n: key "${k}" missing in en`);
  for (const k of en) if (!(k in d.i18n.es.strings)) err(`i18n: key "${k}" missing in es`);
  if (d.i18n.es.locale !== 'es' || d.i18n.en.locale !== 'en') err('i18n: locale mismatch');
  return { errors, warnings };
}

export function formatZodError(file: string, e: unknown): string[] {
  if (e instanceof z.ZodError)
    return e.issues.map((i) => `${file}: ${i.path.join('.')}: ${i.message}`);
  return [`${file}: ${(e as Error).message}`];
}
