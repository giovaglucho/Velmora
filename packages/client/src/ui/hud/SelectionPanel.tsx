// ADR-006 §8.1 — selection counter and up to 60 icons (+N). Re-renders only when the selection changes.
import { useGameView } from '../store';
import { useIntents } from '../intents';
import { t } from '../i18n';

const MAX_ICONS = 60;

export function SelectionPanel() {
  const selection = useGameView((v) => v.selection);
  const groups = useGameView((v) => v.controlGroups);
  const intents = useIntents();
  const more = selection.count - selection.first60.length;
  return (
    <section className="hud-selection" aria-label={t('hud.selection.title')}>
      <h2>{t('hud.selection.title')}</h2>
      <p data-testid="selection-count" data-count={selection.count}>
        {selection.count === 0
          ? t('hud.selection.none')
          : selection.count === 1
            ? t('hud.selection.count.one')
            : t('hud.selection.count', { count: selection.count })}
      </p>
      <ul className="hud-selection-icons">
        {selection.first60.slice(0, MAX_ICONS).map((eid) => (
          <li key={eid} className="hud-icon" title={String(eid)} />
        ))}
        {more > 0 && <li className="hud-more">{t('hud.selection.more', { n: more })}</li>}
      </ul>
      <ul className="hud-groups" aria-label={t('hud.groups.title')}>
        {groups.map((g, n) => (
          <li key={n}>
            <button
              type="button"
              disabled={g.size === 0}
              title={t('hud.groups.slot', { n, size: g.size })}
              onClick={() => intents.selectGroup(n)}
            >
              {n}
              {g.size > 0 && <small>{g.size}</small>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
