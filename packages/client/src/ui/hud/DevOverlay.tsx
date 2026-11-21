// ADR-006 §8.1 — FPS / tick / snapshot mode overlay. Visibility is toggled with F2 by App.
import { useGameView } from '../store';
import { t } from '../i18n';

export function DevOverlay() {
  const perf = useGameView((v) => v.perf);
  const tick = useGameView((v) => v.tick);
  return (
    <aside className="hud-dev" aria-label={t('dev.title')} data-testid="dev-overlay">
      <strong>{t('dev.title')}</strong>
      <dl>
        <dt>{t('dev.fps')}</dt>
        <dd>{perf.fps}</dd>
        <dt>{t('dev.frame')}</dt>
        <dd>{perf.frameMs}</dd>
        <dt>{t('dev.tick')}</dt>
        <dd>{tick}</dd>
        <dt>{t('dev.tickMs')}</dt>
        <dd>{perf.tickMs}</dd>
        <dt>{t('dev.draws')}</dt>
        <dd>{perf.drawCalls}</dd>
        <dt>{t('dev.mode')}</dt>
        <dd>{perf.mode}</dd>
      </dl>
      <small>{t('dev.hint')}</small>
    </aside>
  );
}
