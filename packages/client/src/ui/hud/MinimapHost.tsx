// ADR-006 §7.4 — DOM host for the minimap canvas drawn by render/minimap (R7). It only provides the box.
import { useCallback } from 'react';
import { t } from '../i18n';

export interface MinimapHostProps {
  /** Receives the container element (null on unmount) so the minimap can mount its canvas inside. */
  onHost?: (el: HTMLDivElement | null) => void;
}

export function MinimapHost({ onHost }: MinimapHostProps) {
  const ref = useCallback((el: HTMLDivElement | null) => onHost?.(el), [onHost]);
  return (
    <div
      ref={ref}
      className="hud-minimap"
      aria-label={t('hud.minimap')}
      data-testid="minimap-host"
    />
  );
}
