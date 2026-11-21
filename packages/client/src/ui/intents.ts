// ADR-006 §8.1 — what the HUD may ask for. Components only call these callbacks; the bridge implements
// them by delegating to input/. They never touch game state directly.
import { createContext, useContext } from 'react';

export interface HudIntents {
  selectGroup(n: number): void;
}

export const NOOP_INTENTS: HudIntents = { selectGroup: () => undefined };

export const IntentsContext = createContext<HudIntents>(NOOP_INTENTS);
export const useIntents = (): HudIntents => useContext(IntentsContext);
