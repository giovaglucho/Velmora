// ADR-006 §6, GDD §13.3 — configurable shortcut table. Matching uses KeyboardEvent.code (layout independent).
// Control groups: Ctrl+digit stores; Alt+digit is the alternative for browsers that reserve Ctrl+1–8 for
// tab switching (preventDefault is ignored there). Meta+digit (macOS) also stores.

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export type KeyAction =
  | { kind: 'groupSave'; group: number }
  | { kind: 'groupRecall'; group: number }
  | { kind: 'stop' }
  | { kind: 'pan'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export type Modifier = 'none' | 'ctrl' | 'alt' | 'meta';

export interface KeyBinding {
  code: string;
  modifier: Modifier;
  action: KeyAction;
}

const digitBindings: KeyBinding[] = [];
for (let n = 0; n <= 9; n++) {
  for (const code of ['Digit' + n, 'Numpad' + n]) {
    digitBindings.push({ code, modifier: 'none', action: { kind: 'groupRecall', group: n } });
    for (const modifier of ['ctrl', 'alt', 'meta'] as const)
      digitBindings.push({ code, modifier, action: { kind: 'groupSave', group: n } });
  }
}

export const DEFAULT_KEYMAP: readonly KeyBinding[] = [
  ...digitBindings,
  { code: 'KeyS', modifier: 'none', action: { kind: 'stop' } },
  { code: 'ArrowLeft', modifier: 'none', action: { kind: 'pan', dx: -1, dy: 0 } },
  { code: 'ArrowRight', modifier: 'none', action: { kind: 'pan', dx: 1, dy: 0 } },
  { code: 'ArrowUp', modifier: 'none', action: { kind: 'pan', dx: 0, dy: -1 } },
  { code: 'ArrowDown', modifier: 'none', action: { kind: 'pan', dx: 0, dy: 1 } },
];

function modifierOf(e: KeyLike): Modifier | 'ambiguous' {
  const n = (e.ctrlKey ? 1 : 0) + (e.altKey ? 1 : 0) + (e.metaKey ? 1 : 0);
  if (n === 0) return 'none';
  if (n > 1) return 'ambiguous';
  return e.ctrlKey ? 'ctrl' : e.altKey ? 'alt' : 'meta';
}

/** Resolves a key event to an action; Shift is ignored (reserved for future "add to group"). */
export function resolveKey(
  e: KeyLike,
  keymap: readonly KeyBinding[] = DEFAULT_KEYMAP,
): KeyAction | null {
  const mod = modifierOf(e);
  if (mod === 'ambiguous') return null;
  for (const b of keymap) if (b.code === e.code && b.modifier === mod) return b.action;
  return null;
}
