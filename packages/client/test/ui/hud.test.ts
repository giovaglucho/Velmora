// HUD rendering without a DOM: react-dom/server renders the components against the store.
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/ui/App';
import { DevOverlay } from '../../src/ui/hud/DevOverlay';
import { SelectionPanel } from '../../src/ui/hud/SelectionPanel';
import { en, es, t } from '../../src/ui/i18n';
import { publish, EMPTY_GAME_VIEW } from '../../src/ui/storeCore';
import { recordReactRender, reactRendersPerSec, resetReactMetrics } from '../../src/ui/metrics';

describe('HUD (Spanish by default)', () => {
  it('shows "Nada seleccionado" when empty', () => {
    publish(EMPTY_GAME_VIEW);
    expect(renderToString(createElement(SelectionPanel))).toContain('Nada seleccionado');
  });

  it('shows the counter, up to 60 icons and "+N"', () => {
    publish({
      ...EMPTY_GAME_VIEW,
      selection: {
        count: 100,
        byType: { a: 100 },
        first60: Array.from({ length: 60 }, (_, i) => i),
      },
    });
    const html = renderToString(createElement(SelectionPanel));
    expect(html).toContain('100 unidades seleccionadas');
    expect(html).toContain('data-count="100"');
    expect(html.match(/class="hud-icon"/g)).toHaveLength(60);
    expect(html).toContain('+40');
  });

  it('singular text for one unit', () => {
    publish({ ...EMPTY_GAME_VIEW, selection: { count: 1, byType: {}, first60: [7] } });
    expect(renderToString(createElement(SelectionPanel))).toContain('1 unidad seleccionada');
  });

  it('dev overlay shows perf; App hides it by default and shows tick and minimap host', () => {
    publish({
      ...EMPTY_GAME_VIEW,
      tick: 42,
      perf: { fps: 61, frameMs: 16.2, tickMs: 0.5, drawCalls: 33, mode: 'sab' },
    });
    const dev = renderToString(createElement(DevOverlay));
    expect(dev).toContain('61');
    expect(dev).toContain('33');
    const app = renderToString(createElement(App, {}));
    expect(app).toContain('Tick 42');
    expect(app).toContain('data-testid="minimap-host"');
    expect(app).not.toContain('dev-overlay');
    expect(renderToString(createElement(App, { overlayVisible: true }))).toContain('dev-overlay');
  });
});

describe('i18n', () => {
  it('has the same keys in es and en and substitutes placeholders', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    expect(t('hud.selection.count', { count: 5 })).toBe('5 unidades seleccionadas');
    expect(t('hud.selection.count', { count: 5 }, 'en')).toBe('5 units selected');
  });
});

describe('react render counter', () => {
  it('computes renders per second over a window with an injected clock', () => {
    resetReactMetrics();
    for (let i = 0; i < 8; i++) recordReactRender(1000 + i * 100);
    expect(reactRendersPerSec(1800)).toBe(8);
    expect(reactRendersPerSec(2500)).toBe(3); // only renders at 1500..1700 remain in the last second
  });
});
