/**
 * Translate ink's `useInput` events into the terminal byte sequences
 * a child shell / REPL expects. Used by input-forwarding mode where
 * keystrokes go to the focused service's stdin instead of the TUI's
 * own keybind dispatcher.
 *
 * Why so many cases? When ink reads from a TTY in raw mode it gives
 * us pre-parsed flags (`key.upArrow`, `key.tab`, …) — convenient for
 * keybinds, but lossy when we want to forward a byte stream. We have
 * to reconstitute the standard ANSI / VT escape sequences.
 *
 * Returns `null` for keys we deliberately do NOT forward (Esc is the
 * exit-input-mode hatch and must not also be written to the child).
 */

import type { Key } from 'ink';

const SS3 = '\x1bO'; // application-mode arrows on some terminals; CSI is more common
const CSI = '\x1b[';

export function keyToBytes(input: string, key: Key): string | null {
  // Esc is reserved as "exit input mode" — never forward.
  if (key.escape) {
    return null;
  }
  const named = namedKeyToBytes(key);
  if (named !== null) {
    return named;
  }
  if (key.ctrl && input.length === 1) {
    return ctrlToBytes(input);
  }
  if (key.meta && input.length === 1) {
    return `\x1b${input}`;
  }
  // Plain printable character (Unicode / IME untouched).
  return input || null;
}

/**
 * Special keys ink pre-parses: arrows, Tab, Enter, Backspace, etc.
 * Each maps to the canonical xterm / VT byte sequence so readline, vim,
 * less, etc. recognize them.
 */
function namedKeyToBytes(key: Key): string | null {
  if (key.return) {
    // Pipe mode: send LF directly. A real terminal driver would
    // translate the user's CR keystroke to LF via `icrnl` before the
    // program reads it; we have no terminal driver, so emit LF outright
    // or readline / line-based readers wait forever for an `\n` that
    // never comes.
    return '\n';
  }
  if (key.tab) {
    return key.shift ? `${CSI}Z` : '\t';
  }
  if (key.backspace || key.delete) {
    return '\x7f'; // DEL — what xterm sends for Backspace
  }
  if (key.upArrow) {
    return `${CSI}A`;
  }
  if (key.downArrow) {
    return `${CSI}B`;
  }
  if (key.rightArrow) {
    return `${CSI}C`;
  }
  if (key.leftArrow) {
    return `${CSI}D`;
  }
  if (key.pageUp) {
    return `${CSI}5~`;
  }
  if (key.pageDown) {
    return `${CSI}6~`;
  }
  return null;
}

/**
 * Ctrl+<letter> → \x01..\x1a. Plus a few special cases (Ctrl+Space,
 * Ctrl+], etc.) common enough to support without bloating the matcher.
 */
function ctrlToBytes(input: string): string | null {
  const code = input.toLowerCase().codePointAt(0);
  if (code !== undefined && code >= 0x61 && code <= 0x7a) {
    // 'a' (0x61) → 0x01, 'z' (0x7a) → 0x1a
    return String.fromCodePoint(code - 0x60);
  }
  if (input === ' ') {
    return '\x00'; // Ctrl+Space = NUL
  }
  if (input === ']') {
    return '\x1d';
  }
  return null;
}

/** Sentinel re-export for App.tsx — internal helper above does the work. */
export { SS3 };
