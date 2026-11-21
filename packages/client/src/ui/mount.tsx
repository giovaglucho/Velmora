// Mounts the HUD (React 19) into a container overlaying the canvas. Called from main.ts (I1).
import { createRoot } from 'react-dom/client';
import { App, type AppProps } from './App';

const HUD_CSS = `
.hud-root{position:absolute;inset:0;pointer-events:none;font:13px/1.35 system-ui,sans-serif;color:#e8d9c3}
.hud-root>*{pointer-events:auto}
.hud-clock{position:absolute;top:8px;left:8px;margin:0;padding:2px 8px;background:#14100dcc;border-radius:4px}
.hud-selection{position:absolute;left:8px;bottom:8px;max-width:min(520px,60vw);padding:8px;background:#14100dcc;border-radius:6px}
.hud-selection h2{margin:0 0 4px;font-size:13px;color:#f0b968}.hud-selection p{margin:0 0 6px}
.hud-selection ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:2px}
.hud-icon{width:14px;height:14px;background:#d9763a;border-radius:2px}
.hud-more{padding:0 4px;color:#f0b968}
.hud-groups{margin-top:6px!important}.hud-groups button{min-width:26px;cursor:pointer}
.hud-groups button:disabled{opacity:.4;cursor:default}.hud-groups small{margin-left:2px;opacity:.7}
.hud-minimap{position:absolute;right:8px;bottom:8px;width:256px;height:128px;background:#0008;border-radius:4px}
.hud-dev{position:absolute;top:8px;right:8px;padding:6px 10px;background:#14100dd9;border-radius:6px}
.hud-dev dl{display:grid;grid-template-columns:auto auto;gap:0 12px;margin:4px 0}.hud-dev dd{margin:0;text-align:right}
`;

export function mountHud(container: HTMLElement, props: AppProps = {}): () => void {
  const style = document.createElement('style');
  style.textContent = HUD_CSS;
  document.head.append(style);
  const root = createRoot(container);
  root.render(<App {...props} />);
  return () => {
    root.unmount();
    style.remove();
  };
}
