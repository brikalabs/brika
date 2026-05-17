/**
 * Declarative key binding on top of ink's `useInput`.
 *
 *   useShortcut('q', onQuit);
 *   useShortcut('?', () => router.navigate('help'));
 *   useShortcut('upArrow', () => move(-1));
 *   useShortcut('?', openHelp, isNormalMode);   // 3rd arg disables the bind
 *
 * **Capture-aware automatically.** When an `<Input>` / `<Confirm>` /
 * `<Form>` is mounted and focused, the shell's capture counter is
 * non-zero. Every plain `useShortcut` here auto-suspends so typing in
 * a search field never fires `d`/`p`/`q`. Component-internal shortcuts
 * that *must* keep firing during capture (e.g. `<Search>`'s `↑` / `↓`
 * over the results list, the inner `Ctrl+Enter` action) live inside a
 * `<KeyScope>` which opts them back in.
 *
 * One ink `useInput` is registered per call. That's idiomatic ink
 * usage — the per-key listener fan-out is what gives this primitive
 * its predictability: every handler is its own listener with its own
 * gating, nothing shared, nothing to break by accident.
 *
 * Spec grammar:  `[modifier+]*<key>`
 *   modifier ::= ctrl | shift | meta
 *   key      ::= printable-char | escape | tab | return | backspace
 *              | delete | upArrow | downArrow | leftArrow | rightArrow
 *              | pageUp | pageDown
 */

import { type Key, useInput } from 'ink';
import { useOptionalTuiShell } from '../shell/useTuiShell';
import { useInKeyScope } from './KeyScope';
import { matches, parseSpec } from './keySpec';

export function useShortcut(spec: string, handler: () => void, enabled: boolean = true): void {
  const shell = useOptionalTuiShell();
  const isInputCaptured = shell?.isInputCaptured ?? false;
  const inScope = useInKeyScope();
  const isActive = enabled && (inScope || !isInputCaptured) && spec.length > 0;
  const parsed = spec.length > 0 ? parseSpec(spec) : null;
  useInput(
    (input, key) => {
      if (parsed && matches(parsed, input, key)) {
        handler();
      }
    },
    { isActive }
  );
}

export type ShortcutMap = ReadonlyArray<{ readonly spec: string; readonly handler: () => void }>;

/**
 * Register many shortcuts at once. Use when the binding set is
 * data-driven (a nav table, a menu config) — calling `useShortcut`
 * inside a loop trips Rules-of-Hooks because hook calls would then
 * depend on data, not call order.
 */
export function useShortcutMap(map: ShortcutMap, enabled: boolean = true): void {
  const shell = useOptionalTuiShell();
  const isInputCaptured = shell?.isInputCaptured ?? false;
  const inScope = useInKeyScope();
  const isActive = enabled && (inScope || !isInputCaptured);
  useInput(
    (input, key) => {
      for (const entry of map) {
        if (entry.spec.length === 0) {
          continue;
        }
        if (matches(parseSpec(entry.spec), input, key)) {
          entry.handler();
          return;
        }
      }
    },
    { isActive }
  );
}

/**
 * Raw key listener (escape hatch). Fires for every keystroke while
 * the component is mounted and `enabled` is true. Use this in
 * primitives that need to consume many keys at once — `<Input>`'s
 * keystroke handler, `<ScrollArea>`'s scroll dispatcher — where
 * spelling out a `useShortcut` per key would be wasteful.
 *
 * Auto-suspends under input capture just like `useShortcut`; wrap in
 * `<KeyScope>` to opt back in.
 */
export function useRawInput(
  handler: (input: string, key: Key) => void,
  enabled: boolean = true
): void {
  const shell = useOptionalTuiShell();
  const isInputCaptured = shell?.isInputCaptured ?? false;
  const inScope = useInKeyScope();
  const isActive = enabled && (inScope || !isInputCaptured);
  useInput(handler, { isActive });
}
