/**
 * Declarative key-binding primitive on top of ink's `useInput`.
 *
 *   useKey('q', onQuit);
 *   useKey('ctrl+c', onQuit);
 *   useKey('shift+tab', focusPrev);
 *   useKey('upArrow', () => scroll.scrollUp(1));
 *   useKey('?', openHelp, isNormalMode);   // 4th arg disables the bind
 *
 * One ink `useInput` is registered per call. Multiple `useKey` calls
 * stack — that's idiomatic ink usage and what lets each binding live
 * next to its action (instead of one mega dispatcher).
 *
 * Spec grammar:  `[modifier+]*<key>`
 *   modifier ::= ctrl | shift | meta
 *   key      ::= printable-char | escape | tab | return | backspace
 *              | delete | upArrow | downArrow | leftArrow | rightArrow
 *              | pageUp | pageDown
 *
 * Modifiers are matched *exactly*: `useKey('q', …)` only fires for
 * plain 'q'. `useKey('shift+q', …)` only fires for Shift+Q. This
 * avoids the classic bug where a "shifted" binding accidentally also
 * fires on the unshifted key.
 */

import { type Key, useInput } from 'ink';

const SPECIAL_KEYS = [
  'escape',
  'tab',
  'return',
  'backspace',
  'delete',
  'upArrow',
  'downArrow',
  'leftArrow',
  'rightArrow',
  'pageUp',
  'pageDown',
] as const satisfies ReadonlyArray<keyof Key>;

type SpecialKey = (typeof SPECIAL_KEYS)[number];

export interface Parsed {
  readonly special: SpecialKey | null;
  /** Printable character to match against `input` (null for special keys). */
  readonly char: string | null;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly meta: boolean;
}

export function useKey(
  spec: string,
  handler: (input: string, key: Key) => void,
  enabled: boolean = true
): void {
  const parsed = parseSpec(spec);
  useInput(
    (input, key) => {
      if (!matches(parsed, input, key)) {
        return;
      }
      handler(input, key);
    },
    { isActive: enabled }
  );
}

export function parseSpec(spec: string): Parsed {
  // Edge case: `+` is also the modifier separator, so a bare `+` (or
  // `ctrl++` etc.) trips a naive `split('+')`. Handle it explicitly:
  // a spec ending with `+` always represents the literal `+` char,
  // with everything before the trailing `+` as modifiers.
  if (spec.endsWith('+')) {
    const modPart = spec.length === 1 ? '' : spec.slice(0, -2);
    const mods = new Set(modPart === '' ? [] : modPart.split('+'));
    return {
      special: null,
      char: '+',
      ctrl: mods.has('ctrl'),
      shift: mods.has('shift'),
      meta: mods.has('meta'),
    };
  }
  const parts = spec.split('+');
  const last = parts.at(-1);
  if (last === undefined || last.length === 0) {
    throw new Error(`useKey: invalid key spec ${JSON.stringify(spec)}`);
  }
  const mods = new Set(parts.slice(0, -1));
  const isSpecial = (SPECIAL_KEYS as ReadonlyArray<string>).includes(last);
  return {
    special: isSpecial ? (last as SpecialKey) : null,
    char: isSpecial ? null : last,
    ctrl: mods.has('ctrl'),
    shift: mods.has('shift'),
    meta: mods.has('meta'),
  };
}

export function matches(parsed: Parsed, input: string, key: Key): boolean {
  if (parsed.ctrl !== key.ctrl) {
    return false;
  }
  if (parsed.meta !== key.meta) {
    return false;
  }
  if (parsed.special !== null) {
    // For special keys, the corresponding flag must be set AND shift
    // must match exactly (so shift+tab ≠ tab).
    return key[parsed.special] === true && parsed.shift === key.shift;
  }
  // For printable keys, ink does NOT set key.shift for uppercase chars
  // (the char itself is already 'Q'), so we don't require shift to
  // match — the char IS the discriminator. Modifier requirements above
  // still apply.
  return input === parsed.char;
}
