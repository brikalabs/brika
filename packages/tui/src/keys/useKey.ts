/**
 * Declarative key-binding primitive on top of ink's `useInput`.
 *
 *   useKey('q', onQuit);
 *   useKey('?', () => router.navigate('help'));
 *   useKey('upArrow', () => move(-1));
 *   useKey('?', openHelp, isNormalMode);   // 3rd arg disables the bind
 *
 * **Capture-aware automatically.** When a primitive that takes raw
 * keys (`<Input>`, `<Confirm>`, `<Form>`) is mounted, every plain
 * `useKey` bind in the tree auto-suspends — so typing in a search
 * field never fires `d`/`p`/`q` and the like. The capturing
 * primitive wraps its tree in `<KeyScope>`, which opts its own
 * internal binds (Search's `↑↓` / `Ctrl+Enter`, …) back in. Consumer
 * code is just `useKey(spec, handler)` — no flags, no manual
 * `!isInputCaptured` gating, no `system: true` opt-outs.
 *
 * One ink `useInput` is registered per call. Multiple `useKey`
 * calls stack — that's idiomatic ink usage and lets each binding
 * live next to its action.
 *
 * Spec grammar:  `[modifier+]*<key>`
 *   modifier ::= ctrl | shift | meta
 *   key      ::= printable-char | escape | tab | return | backspace
 *              | delete | upArrow | downArrow | leftArrow | rightArrow
 *              | pageUp | pageDown
 *
 * Modifiers match exactly: `useKey('q', …)` fires only for plain 'q'.
 * `useKey('shift+q', …)` fires only for Shift+Q.
 */

import { type Key, useInput } from 'ink';
import { useOptionalTuiShell } from '../shell/useTuiShell';
import { useInKeyScope } from './KeyScope';

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
  // Soft dependency on the shell: if no `<TuiShellProvider>` is in the
  // tree (e.g. the engine debug overlay, which sits above it), treat
  // capture as off — every bind just behaves like a plain `useInput`.
  const shell = useOptionalTuiShell();
  const isInputCaptured = shell?.isInputCaptured ?? false;
  const inScope = useInKeyScope();
  const isActive = enabled && (inScope || !isInputCaptured);
  const parsed = parseSpec(spec);
  useInput(
    (input, key) => {
      if (!matches(parsed, input, key)) {
        return;
      }
      handler(input, key);
    },
    { isActive }
  );
}

export type KeyMap = ReadonlyArray<{ readonly spec: string; readonly handler: () => void }>;

/**
 * Register many key bindings in a single capture-aware hook call. Use
 * when the binding set is data-driven (e.g. derived from a nav table)
 * — calling `useKey` inside a loop trips the Rules-of-Hooks check
 * since hook calls then depend on data, not call order.
 */
export function useKeyMap(map: KeyMap, enabled: boolean = true): void {
  const shell = useOptionalTuiShell();
  const isInputCaptured = shell?.isInputCaptured ?? false;
  const inScope = useInKeyScope();
  const isActive = enabled && (inScope || !isInputCaptured);
  useInput(
    (input, key) => {
      for (const entry of map) {
        if (matches(parseSpec(entry.spec), input, key)) {
          entry.handler();
          return;
        }
      }
    },
    { isActive }
  );
}

/** Friendly aliases — let consumers write `enter` / `esc` / `space`
 *  instead of remembering the Ink names. Case-insensitive. */
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

function resolveSpecial(token: string): SpecialKey | null {
  const lowered = token.toLowerCase();
  const aliased = KEY_ALIASES[lowered] ?? lowered;
  if ((SPECIAL_KEYS as ReadonlyArray<string>).includes(aliased)) {
    return aliased as SpecialKey;
  }
  return null;
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
  // Treat `space` as the literal space char so consumers can write
  // `shortcut="space"` rather than `shortcut=" "`.
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
