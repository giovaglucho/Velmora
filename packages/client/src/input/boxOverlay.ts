// ADR-006 §8.2 — rubber-band rectangle as a plain DOM element (updated by events, never through React/store).
import type { ScreenRect } from './picking';

export interface BoxOverlay {
  set(rect: ScreenRect | null): void;
  dispose(): void;
}

/** `parent` must be positioned (the HUD root overlaying the canvas); pointer-events are disabled. */
export function createBoxOverlay(parent: HTMLElement): BoxOverlay {
  const el = document.createElement('div');
  el.className = 'selection-box';
  Object.assign(el.style, {
    position: 'absolute',
    display: 'none',
    pointerEvents: 'none',
    border: '1px solid rgba(240, 185, 104, 0.95)',
    background: 'rgba(240, 185, 104, 0.12)',
    boxSizing: 'border-box',
  });
  parent.append(el);
  return {
    set(r) {
      if (!r) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.left = Math.min(r.x0, r.x1) + 'px';
      el.style.top = Math.min(r.y0, r.y1) + 'px';
      el.style.width = Math.abs(r.x1 - r.x0) + 'px';
      el.style.height = Math.abs(r.y1 - r.y0) + 'px';
    },
    dispose() {
      el.remove();
    },
  };
}
