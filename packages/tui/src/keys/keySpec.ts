/**
 * Key-spec parser shared by `useShortcut` and the dispatcher.
 *
 * Spec grammar:  `[modifier+]*<key>`
 *   modifier ::= ctrl | shift | meta
 *   key      ::= printable-char | escape | tab | return | backspace
 *              | delete | upArrow | downArrow | leftArrow | rightArrow
 *              | pageUp | pageDown
 *
 * Modifiers match exactly: `'q'` fires only for plain 'q'; `'shift+q'`
 * fires only for Shift+Q. Friendly aliases (`enter`, `esc`, `up`, …)
 * are normalised before resolution.
 */

import type { Key } from 'ink';

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

const KEY_ALIASES: Readonly<Record<string, string>> = {
  enter: 'return',
  esc: 'escape',
  up: 'upArrow',
  down: 'downArrow',
  left: 'leftArrow',
  right: 'rightArrow',
  pgup: 'pageUp',
  pgdown: 'pageDown',
  pgdn: 'pageDown',
};

/** Lower-cased → original camelCase. Built once so `parseSpec` can do a
 *  case-insensitive lookup against the ink `Key` flag names (`upArrow`,
 *  `pageDown`, …) without forcing callers to remember the casing. */
const SPECIAL_BY_LOWER: Readonly<Record<string, SpecialKey>> = Object.fromEntries(
  SPECIAL_KEYS.map((k) => [k.toLowerCase(), k])
) as Record<string, SpecialKey>;

function resolveSpecial(token: string): SpecialKey | null {
  const lowered = token.toLowerCase();
  const aliased = (KEY_ALIASES[lowered] ?? lowered).toLowerCase();
  return SPECIAL_BY_LOWER[aliased] ?? null;
}

export function parseSpec(spec: string): Parsed {
  // Edge case: `+` is also the modifier separator, so a bare `+` (or
  // `ctrl++` etc.) trips a naive `split('+')`. A spec ending with `+`
  // always represents the literal `+` char, with everything before the
  // trailing `+` treated as modifiers.
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
    throw new Error(`useShortcut: invalid key spec ${JSON.stringify(spec)}`);
  }
  const mods = new Set(parts.slice(0, -1));
  if (last.toLowerCase() === 'space') {
    return {
      special: null,
      char: ' ',
      ctrl: mods.has('ctrl'),
      shift: mods.has('shift'),
      meta: mods.has('meta'),
    };
  }
  const special = resolveSpecial(last);
  return {
    special,
    char: special === null ? last : null,
    ctrl: mods.has('ctrl'),
    shift: mods.has('shift'),
    meta: mods.has('meta'),
  };
}

export function matches(parsed: Parsed, input: string, key: Key): boolean {
  if (parsed.ctrl !== key.ctrl) {
    return false;
  }
  if (parsed.special !== null) {
    // Special keys: ink's `parseKeypress` sets `key.meta = true` for
    // `escape` AND for any CSI-style sequence (arrow keys, PgUp/PgDn,
    // …) via its legacy `option` heuristic. Requiring `parsed.meta ===
    // key.meta` would make every `useShortcut('escape' | 'upArrow' |
    // …)` a silent no-op. The special flag itself is unambiguous, so
    // just match it + the shift bit (so `shift+tab` ≠ `tab`).
    return key[parsed.special] === true && parsed.shift === key.shift;
  }
  if (parsed.meta !== key.meta) {
    return false;
  }
  // For printable keys, ink does NOT set key.shift for uppercase chars
  // (the char itself is already 'Q'), so we don't require shift to
  // match — the char IS the discriminator. Modifier requirements above
  // still apply.
  return input === parsed.char;
}
