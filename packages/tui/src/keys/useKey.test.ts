import { describe, expect, test } from 'bun:test';
import type { Key } from 'ink';
import { matches, parseSpec } from './useKey';

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

  test('throws on trailing +', () => {
    expect(() => parseSpec('ctrl+')).toThrow(/invalid key spec/);
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

  test('printable matches do NOT require shift flag (char IS the discriminator)', () => {
    const p = parseSpec('Q');
    // ink doesn't set shift for uppercase chars — the char alone matches
    expect(matches(p, 'Q', key())).toBe(true);
    expect(matches(p, 'Q', key({ shift: true }))).toBe(true);
    expect(matches(p, 'q', key())).toBe(false);
  });
});
