import { describe, expect, it } from 'vitest';
import { resolveKey, type KeyLike } from '../../src/input/keymap';

const k = (code: string, m: Partial<KeyLike> = {}): KeyLike => ({
  code,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...m,
});

describe('keymap', () => {
  it('digit recalls; Ctrl, Alt and Meta + digit store', () => {
    expect(resolveKey(k('Digit3'))).toEqual({ kind: 'groupRecall', group: 3 });
    expect(resolveKey(k('Digit0'))).toEqual({ kind: 'groupRecall', group: 0 });
    expect(resolveKey(k('Digit3', { ctrlKey: true }))).toEqual({ kind: 'groupSave', group: 3 });
    expect(resolveKey(k('Digit3', { altKey: true }))).toEqual({ kind: 'groupSave', group: 3 });
    expect(resolveKey(k('Numpad9', { metaKey: true }))).toEqual({ kind: 'groupSave', group: 9 });
  });
  it('arrows pan, S stops, unknown and multi-modifier combos do nothing', () => {
    expect(resolveKey(k('ArrowLeft'))).toEqual({ kind: 'pan', dx: -1, dy: 0 });
    expect(resolveKey(k('ArrowDown'))).toEqual({ kind: 'pan', dx: 0, dy: 1 });
    expect(resolveKey(k('KeyS'))).toEqual({ kind: 'stop' });
    expect(resolveKey(k('KeyS', { ctrlKey: true }))).toBeNull(); // Ctrl+S is the browser's
    expect(resolveKey(k('Digit1', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(resolveKey(k('KeyQ'))).toBeNull();
  });
  it('custom keymap overrides the table', () => {
    const km = [{ code: 'KeyX', modifier: 'none', action: { kind: 'stop' } }] as const;
    expect(resolveKey(k('KeyX'), km)).toEqual({ kind: 'stop' });
    expect(resolveKey(k('KeyS'), km)).toBeNull();
  });
});
