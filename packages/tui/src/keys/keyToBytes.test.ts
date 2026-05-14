/**
 * Tests for the ink-event → terminal-byte translator. Each case
 * mirrors the spec a real shell / readline expects (xterm CSI for
 * arrows, DEL for backspace, \x01..\x1a for Ctrl+letter, etc.).
 */

import { describe, expect, test } from 'bun:test';
import type { Key } from 'ink';
import { keyToBytes } from './keyToBytes';

/**
 * Synthesize a `Key` for tests. ink's `Key` keeps adding optional
 * flags over time (home, end, super, hyper, capsLock, numLock,
 * eventType) — listing all of them here would be churn for every
 * minor ink version. Cast through unknown since the translator only
 * reads the named fields we care about.
 */
function key(overrides: Partial<Key> = {}): Key {
  const base: Record<string, boolean> = {
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
  };
  return { ...base, ...overrides } as unknown as Key;
}

describe('keyToBytes', () => {
  test('printable characters pass through unchanged', () => {
    expect(keyToBytes('a', key())).toBe('a');
    expect(keyToBytes('Z', key({ shift: true }))).toBe('Z');
    expect(keyToBytes('é', key())).toBe('é');
    expect(keyToBytes('𝛼', key())).toBe('𝛼'); // multi-byte
  });

  test('Esc returns null (reserved as exit-input-mode)', () => {
    expect(keyToBytes('', key({ escape: true }))).toBeNull();
  });

  test('Enter → LF (pipe mode; PTY backend would re-translate)', () => {
    expect(keyToBytes('', key({ return: true }))).toBe('\n');
  });

  test('Tab → HT; shift+Tab → CSI Z (xterm)', () => {
    expect(keyToBytes('', key({ tab: true }))).toBe('\t');
    expect(keyToBytes('', key({ tab: true, shift: true }))).toBe('\x1b[Z');
  });

  test('Backspace / Delete → DEL (0x7f)', () => {
    expect(keyToBytes('', key({ backspace: true }))).toBe('\x7f');
    expect(keyToBytes('', key({ delete: true }))).toBe('\x7f');
  });

  test('Arrows → CSI A/B/C/D', () => {
    expect(keyToBytes('', key({ upArrow: true }))).toBe('\x1b[A');
    expect(keyToBytes('', key({ downArrow: true }))).toBe('\x1b[B');
    expect(keyToBytes('', key({ rightArrow: true }))).toBe('\x1b[C');
    expect(keyToBytes('', key({ leftArrow: true }))).toBe('\x1b[D');
  });

  test('PgUp / PgDn → CSI 5~ / 6~', () => {
    expect(keyToBytes('', key({ pageUp: true }))).toBe('\x1b[5~');
    expect(keyToBytes('', key({ pageDown: true }))).toBe('\x1b[6~');
  });

  test('Ctrl+letter → 0x01..0x1a', () => {
    expect(keyToBytes('a', key({ ctrl: true }))).toBe('\x01');
    expect(keyToBytes('c', key({ ctrl: true }))).toBe('\x03'); // SIGINT char
    expect(keyToBytes('d', key({ ctrl: true }))).toBe('\x04'); // EOF
    expect(keyToBytes('z', key({ ctrl: true }))).toBe('\x1a');
  });

  test('Ctrl+letter is case-insensitive (uppercase → same code)', () => {
    expect(keyToBytes('C', key({ ctrl: true }))).toBe('\x03');
  });

  test('Ctrl+Space → NUL', () => {
    expect(keyToBytes(' ', key({ ctrl: true }))).toBe('\x00');
  });

  test('Meta+letter → ESC + letter (xterm Alt convention)', () => {
    expect(keyToBytes('b', key({ meta: true }))).toBe('\x1bb');
  });

  test('empty input with no modifiers returns null', () => {
    expect(keyToBytes('', key())).toBeNull();
  });
});
