// ADR-006 §8.1 — UI texts. Spanish by default, English alternative; code stays in English.
export type Locale = 'es' | 'en';

export const es = {
  'hud.selection.title': 'Selección',
  'hud.selection.none': 'Nada seleccionado',
  'hud.selection.count': '{count} unidades seleccionadas',
  'hud.selection.count.one': '1 unidad seleccionada',
  'hud.selection.more': '+{n}',
  'hud.groups.title': 'Grupos',
  'hud.groups.slot': 'Grupo {n}: {size} unidades',
  'hud.clock.tick': 'Tick {tick}',
  'hud.mode.sab': 'Memoria compartida',
  'hud.mode.transfer': 'Transferencia',
  'hud.minimap': 'Minimapa',
  'dev.title': 'Depuración',
  'dev.fps': 'FPS',
  'dev.frame': 'Frame (ms)',
  'dev.tickMs': 'Tick sim (ms)',
  'dev.draws': 'Draw calls',
  'dev.mode': 'Modo',
  'dev.tick': 'Tick',
  'dev.hint': 'F2 para ocultar',
} as const satisfies Record<string, string>;

export type TextKey = keyof typeof es;

export const en: Readonly<Record<TextKey, string>> = {
  'hud.selection.title': 'Selection',
  'hud.selection.none': 'Nothing selected',
  'hud.selection.count': '{count} units selected',
  'hud.selection.count.one': '1 unit selected',
  'hud.selection.more': '+{n}',
  'hud.groups.title': 'Groups',
  'hud.groups.slot': 'Group {n}: {size} units',
  'hud.clock.tick': 'Tick {tick}',
  'hud.mode.sab': 'Shared memory',
  'hud.mode.transfer': 'Transfer',
  'hud.minimap': 'Minimap',
  'dev.title': 'Debug',
  'dev.fps': 'FPS',
  'dev.frame': 'Frame (ms)',
  'dev.tickMs': 'Sim tick (ms)',
  'dev.draws': 'Draw calls',
  'dev.mode': 'Mode',
  'dev.tick': 'Tick',
  'dev.hint': 'F2 to hide',
};

export const DEFAULT_LOCALE: Locale = 'es';
const tables: Record<Locale, Readonly<Record<TextKey, string>>> = { es, en };

/** Looks up a text and substitutes `{name}` placeholders. */
export function t(
  key: TextKey,
  vars?: Readonly<Record<string, string | number>>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const raw = tables[locale][key];
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => String(vars[k] ?? m)) : raw;
}
