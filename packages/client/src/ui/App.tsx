// ADR-006 §8.1 — DOM HUD layer over the canvas. Reads the 10 Hz store only; never per-frame state.
import { Profiler, useEffect, useState } from 'react';
import { IntentsContext, NOOP_INTENTS, type HudIntents } from './intents';
import { recordReactRender } from './metrics';
import { useGameView } from './store';
import { t } from './i18n';
import { DevOverlay } from './hud/DevOverlay';
import { MinimapHost } from './hud/MinimapHost';
import { SelectionPanel } from './hud/SelectionPanel';

export interface AppProps {
  intents?: HudIntents;
  onMinimapHost?: (el: HTMLDivElement | null) => void;
  /** Monotonic ms clock for the React render counter (performance.now in production). */
  now?: () => number;
  /** Initial overlay visibility (F2 toggles). */
  overlayVisible?: boolean;
}

function Clock() {
  const tick = useGameView((v) => v.tick);
  const mode = useGameView((v) => v.perf.mode);
  return (
    <p className="hud-clock" data-testid="hud-clock">
      {t('hud.clock.tick', { tick })} · {t(mode === 'sab' ? 'hud.mode.sab' : 'hud.mode.transfer')}
    </p>
  );
}

export function App({
  intents = NOOP_INTENTS,
  onMinimapHost,
  now,
  overlayVisible = false,
}: AppProps) {
  const [overlay, setOverlay] = useState(overlayVisible);
  useEffect(() => {
    // F2 is a UI toggle, not game input: handled here so the input router stays game-only.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'F2') return;
      e.preventDefault();
      setOverlay((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const clock = now ?? (() => performance.now());
  return (
    <Profiler id="hud" onRender={() => recordReactRender(clock())}>
      <IntentsContext.Provider value={intents}>
        <div className="hud-root">
          <Clock />
          <SelectionPanel />
          <MinimapHost onHost={onMinimapHost} />
          {overlay && <DevOverlay />}
        </div>
      </IntentsContext.Provider>
    </Profiler>
  );
}
