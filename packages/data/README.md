# @reinos/data

Balance data for Reinos de Ceniza: JSON in `json/`, Zod schemas in `src/schemas/`, validator in `src/check.ts`.
Source of truth: `docs/GDD.md`. Every entry is transcribed from a GDD table; where the GDD is ambiguous the entry carries a `notes` field starting with `AMBIGUO:` (no invented numbers). Pending items: `COVERAGE.md`.

## Commands

- `pnpm data:check` (root) / `pnpm --filter @reinos/data check`: Zod-validates every JSON, checks cross references, prints counts, exit code 1 on any error.
- `pnpm --filter @reinos/data test | typecheck`.

## Layout

| File                                                | GDD                                                                 | Schema                                            |
| --------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `resources.json`                                    | §4.1                                                                | `ResourcesFile`                                   |
| `economy.json`                                      | §4.2-4.4, 4.6 (rates, sources, market, trade, tribute)              | `EconomyFile`                                     |
| `ages.json`                                         | §2, §5                                                              | `AgesFile`                                        |
| `units.json`                                        | §7.1-7.2, §18.1                                                     | `UnitsFile`                                       |
| `buildings.json`                                    | §6                                                                  | `BuildingsFile`                                   |
| `techs.json`                                        | §4.5, §9, §10 unique techs                                          | `TechsFile`                                       |
| `upgrades.json`                                     | §7.2 line upgrades, §6 defense upgrades                             | `UpgradesFile`                                    |
| `combat.json`                                       | §6 build/repair, §8                                                 | `CombatFile`                                      |
| `game.json`                                         | §3.5, §11.2, §11.3, ADR-005 `movement`                              | `GameFile`                                        |
| `factions/*.json`                                   | §10                                                                 | `FactionDef`                                      |
| `maps/*.json`                                       | §11.4                                                               | `MapScript`                                       |
| `ai/difficulties.json`, `layers.json`, `rules.json` | §12.1-12.3                                                          | `DifficultiesFile`, `AiLayersFile`, `AiRulesFile` |
| `i18n/{es,en}.json`                                 | UI strings (minimal); entity names live in each entity as `{es,en}` | `I18nFile`                                        |

## Conventions

- **Units of measure: GDD units, converted by the consumer.** JSON keeps GDD numbers (speed 0.8 tiles/s, reload 1.8 s, range in tiles, accuracy integer percent). `economy.json` and `combat.json` declare `fixedScale: 1000`; the sim converts with `toFixed(x)` = `round(x * 1000)` at load time (`src/data.ts`) and does integer-only math after that (GDD §8). Do not store floats computed at runtime.
- **Costs** are integer objects `{food, wood, aether, stone}`; missing key = 0. Times are game seconds (§3.5).
- **Percentages** in modifiers: `mul_pct` value is a delta (+20 = +20%, -25 = -25%); `accuracy` and `tribute_fee`/`market_fee` use `set` with percent integers.
- **Attacks/armors** are maps keyed by the §8.2 armor classes. §7.1 gives a single "Atq" and "Arm. C/P": melee/pierce armor map to `armors.melee`/`armors.pierce`; the single attack is stored under `attacks.melee` for melee units and `attacks.pierce` for ranged, siege-projectile, ship and gunpowder units (data convention, bonus attacks are not tabulated in §7.1).
- **Per-age values** (building HP, vision, valueByAge) are maps keyed by age `"1".."4"`; only ages the GDD specifies are present.
- **Ambiguous rows** (`45/55/60`, `II / III / IV`, `0/180-195`, ...) are expanded to one entry per variant. Range rule: for "X-Y" over 3 variants, the first takes X and the rest take Y; the entry's `notes` says so.
- **Modifier selectors** (`{target, stat, op, value}`, §9): `unit:<id>`, `line:<line>` (the `line` field of units), `class:<class>`, `building:<id>`, `buildings:all|towers|walls`, `resource:<id>`, `global`. `towers`/`walls` groups are defined by role in `buildings.json` (`torre_de_vigia`, `torre_de_bombarda_de_eter` / `empalizada`, `muralla_de_piedra`, portones). Effects that the GDD only describes in prose use `op: "script"` with a script name.
- `sprite`/`voice` are placeholder asset keys (`units/<id>`, first class) until the asset pipeline defines them; they carry no balance.
- `DATA_VERSION` (`src/data.ts`) must be bumped on any balance change (GDD §18.1: recorded in matches and replays).
- English names are translations added for the i18n requirement; the GDD only gives Spanish (except the §18.1 sample).

## Validator checks

Zod strict parsing of every file; duplicate ids; `unit.building`, `upgradesTo`, upgrade entries, tech building/requires/targets, faction unique techs / disabled lists / grants, age requirement buildings, map object types vs `economy.sources`, AI rule unit/building references, i18n key parity, gather-rate per-minute consistency, `src/data.ts` imports match files on disk.
