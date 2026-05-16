import { describe, expect, test } from 'bun:test';
import type { Key } from 'ink';
import { matches, parseSpec } from './keySpec';

/**
 * Build an ink `Key` with all flags off, then merge overrides. ink's
 * `Key` type keeps growing optional flags (super, hyper, capsLock…)
 * across versions; spreading from an empty object keeps these tests
 * forward-compatible.
 */
function key(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    ...overrides,
  } as Key;
}

describe('parseSpec', () => {
  test('plain printable character', () => {
    expect(parseSpec('q')).toEqual({
      special: null,
      char: 'q',
      ctrl: false,
      shift: false,
      meta: false,
    });
  });

  test('special key without modifiers', () => {
    expect(parseSpec('escape')).toEqual({
      special: 'escape',
      char: null,
      ctrl: false,
      shift: false,
      meta: false,
    });
  });

  test('camelCase ink Key names parse case-insensitively (regression: was no-op)', () => {
    // `upArrow` / `downArrow` / `pageDown` / `leftArrow` are the ink
    // `Key` flag names; consumers naturally write them in camelCase.
    // A previous parser lower-cased the token then tried to match the
    // camelCase entries in `SPECIAL_KEYS` directly — so every
    // `useShortcut('upArrow', …)` silently never fired.
    const specs = [
      'upArrow',
      'downArrow',
      'leftArrow',
      'rightArrow',
      'pageUp',
      'pageDown',
    ] as const;
    for (const spec of specs) {
      const parsed = parseSpec(spec);
      expect(parsed.special).toBe(spec);
      expect(parsed.char).toBeNull();
    }
  });

  test('special keys also accept the short alias forms', () => {
    expect(parseSpec('up').special).toBe('upArrow');
    expect(parseSpec('down').special).toBe('downArrow');
    expect(parseSpec('left').special).toBe('leftArrow');
    expect(parseSpec('right').special).toBe('rightArrow');
    expect(parseSpec('pgup').special).toBe('pageUp');
    expect(parseSpec('pgdn').special).toBe('pageDown');
  });

  test('single modifier + printable', () => {
    expect(parseSpec('ctrl+c')).toEqual({
      special: null,
      char: 'c',
      ctrl: true,
      shift: false,
      meta: false,
    });
  });

  test('shift+special', () => {
    expect(parseSpec('shift+tab')).toEqual({
      special: 'tab',
      char: null,
      ctrl: false,
      shift: true,
      meta: false,
    });
  });

  test('all three modifiers', () => {
    expect(parseSpec('ctrl+shift+meta+a')).toEqual({
      special: null,
      char: 'a',
      ctrl: true,
      shift: true,
      meta: true,
    });
  });

  test('throws on empty spec', () => {
    expect(() => parseSpec('')).toThrow(/invalid key spec/);
  });

  test('bare + is the literal plus char (special-cased because + is the mod separator)', () => {
    expect(parseSpec('+')).toEqual({
      special: null,
      char: '+',
      ctrl: false,
      shift: false,
      meta: false,
    });
  });

  test('ctrl++ binds ctrl with the literal plus char', () => {
    expect(parseSpec('ctrl++')).toEqual({
      special: null,
      char: '+',
      ctrl: true,
      shift: false,
      meta: false,
    });
  });

  test('shift+meta++ stacks modifiers around the literal plus', () => {
    expect(parseSpec('shift+meta++')).toEqual({
      special: null,
      char: '+',
      ctrl: false,
      shift: true,
      meta: true,
    });
  });
});

describe('matches', () => {
  test('plain key fires only on exact input', () => {
    const p = parseSpec('q');
    expect(matches(p, 'q', key())).toBe(true);
    expect(matches(p, 'r', key())).toBe(false);
  });

  test('ctrl+c requires ctrl flag', () => {
    const p = parseSpec('ctrl+c');
    expect(matches(p, 'c', key({ ctrl: true }))).toBe(true);
    expect(matches(p, 'c', key())).toBe(false);
  });

  test('plain `c` does NOT fire when ctrl is held (modifier mismatch)', () => {
    const p = parseSpec('c');
    expect(matches(p, 'c', key({ ctrl: true }))).toBe(false);
    expect(matches(p, 'c', key())).toBe(true);
  });

  test('meta mismatch rejects', () => {
    const p = parseSpec('meta+x');
    expect(matches(p, 'x', key({ meta: true }))).toBe(true);
    expect(matches(p, 'x', key())).toBe(false);
  });

  test('special key requires its flag set', () => {
    const p = parseSpec('escape');
    expect(matches(p, '', key({ escape: true }))).toBe(true);
    expect(matches(p, '', key())).toBe(false);
  });

  test('shift+tab distinguishes from tab', () => {
    const shifted = parseSpec('shift+tab');
    const plain = parseSpec('tab');
    expect(matches(shifted, '', key({ tab: true, shift: true }))).toBe(true);
    expect(matches(shifted, '', key({ tab: true }))).toBe(false);
    expect(matches(plain, '', key({ tab: true }))).toBe(true);
    expect(matches(plain, '', key({ tab: true, shift: true }))).toBe(false);
  });

  test('escape matches even though ink sets key.meta=true (regression: silent no-op)', () => {
    // ink's parseKeypress sets `key.meta = true` whenever
    // `keypress.name === 'escape'` — a back-compat quirk. Without
    // special-casing, every `useShortcut('escape', …)` would never
    // fire because parsed.meta=false ≠ key.meta=true.
    const p = parseSpec('escape');
    expect(matches(p, '', key({ escape: true, meta: true }))).toBe(true);
    expect(matches(p, '', key({ escape: true }))).toBe(true);
  });

  test('arrow keys match even when ink sets key.meta=true via CSI option flag', () => {
    // Same quirk: ink's option/CSI handling routes via the meta flag.
    // Arrow keys must fire regardless.
    const p = parseSpec('upArrow');
    expect(matches(p, '', key({ upArrow: true, meta: true }))).toBe(true);
    expect(matches(p, '', key({ upArrow: true }))).toBe(true);
  });

  test('printable matches do NOT require shift flag (char IS the discriminator)', () => {
    const p = parseSpec('Q');
    // ink doesn't set shift for uppercase chars — the char alone matches
    expect(matches(p, 'Q', key())).toBe(true);
    expect(matches(p, 'Q', key({ shift: true }))).toBe(true);
    expect(matches(p, 'q', key())).toBe(false);
  });
});
