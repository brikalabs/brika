/**
 * `<Button>` — keyboard-shortcut action, the TUI equivalent of a
 * shadcn button. There's no concept of mouse focus in our shell, so
 * "clickable" means "a key is bound to this action and the user sees
 * which one." The visible glyph IS the shortcut hint:
 *
 *   <Button shortcut="e" onPress={enable} variant="success">Enable</Button>
 *   <Button shortcut="X" onPress={uninstall} variant="destructive">Uninstall</Button>
 *
 *   →  [e] Enable     [X] Uninstall
 *
 * The button registers its own `useKey(shortcut, onPress)` so the
 * binding lives next to the label that documents it — no separate
 * footer hint to keep in sync. Disable the binding when the action
 * isn't applicable via `enabled={…}` (mirrors `useKey`'s third arg).
 *
 * Variants:
 *   - `default`     — cyan accent, the neutral action.
 *   - `success`     — green.
 *   - `warning`     — yellow.
 *   - `destructive` — red.
 *   - `ghost`       — no accent on the label, just the shortcut.
 *
 * A row of buttons is just `<Box>` of `<Button>`s — no wrapper
 * primitive needed. Use `<Box gap={2}>` (Ink ≥ 6) or `<Button>`'s
 * built-in `marginRight={2}` (the default) to space them out.
 */

import { Box, type DOMElement, Text, useFocusManager } from 'ink';
import type React from 'react';
import { type ReactNode, useCallback, useRef } from 'react';
import { useFocusable } from '../keys/useFocusable';
import { useKey } from '../keys/useKey';
import { hitTest, readBounds } from '../mouse/useBounds';
import { type MouseEvent, useMouse } from '../mouse/useMouse';

export type ButtonVariant = 'default' | 'success' | 'warning' | 'destructive' | 'ghost';

export interface ButtonProps {
  /** Key spec passed to `useKey` — `e`, `D`, `ctrl+s`, `enter`,
   *  `escape`, etc. The display in `[…]` is pretty-printed (`^S`,
   *  `↵`, `Esc`). Pass an empty string to disable the shortcut chip
   *  while keeping click + Tab+Enter behaviour. */
  readonly shortcut: string;
  readonly onPress: () => void;
  /** Disable the binding (and dim the label). Default `true`. */
  readonly enabled?: boolean;
  readonly variant?: ButtonVariant;
  /** Grab focus on mount. Default `false` (Buttons usually let an
   *  Input take focus first). */
  readonly autoFocus?: boolean;
  /** Opt-in stable id for ink's focus manager. */
  readonly id?: string;
  /** DOM-style tab order — `-1` opts out of the Tab cycle. Click and
   *  shortcut still work. Default `0`. */
  readonly tabIndex?: number;
  readonly children?: ReactNode;
}

const VARIANT_COLOR: Readonly<Record<ButtonVariant, string | undefined>> = {
  default: 'cyan',
  success: 'green',
  warning: 'yellow',
  destructive: 'red',
  ghost: undefined,
};

/**
 * Two ways to activate a Button:
 *
 *   - **Shortcut** — type the key in brackets. Always live (subject
 *     to the usual capture rules of `useKey`).
 *   - **Focus + Enter** — Tab onto the button (ink's native focus
 *     cycle) and press Enter / Space. Useful when the user is
 *     already navigating with Tab from an adjacent Input.
 *
 * Focused state shows `▸ ` before the bracket so the eye can find
 * the active button without scanning shortcuts.
 */
export function Button({
  shortcut,
  onPress,
  enabled = true,
  variant = 'default',
  autoFocus = false,
  id,
  tabIndex,
  children,
}: Readonly<ButtonProps>): React.ReactElement {
  const { isFocused, focusId } = useFocusable({
    id,
    tabIndex,
    autoFocus,
    enabled,
    onPress,
  });
  const { focus } = useFocusManager();
  const boxRef = useRef<DOMElement>(null);

  // The shortcut chip is optional — `shortcut=""` skips the keybind so
  // the Button stays click+focus-only (useful for layout-only buttons).
  useKey(shortcut, onPress, enabled && shortcut.length > 0);

  // Mouse: focus on press-down, fire on click. Bounds are read once
  // per event (via `readBounds`) instead of tracked through React
  // state — keeps per-render work to zero so a screen full of
  // buttons doesn't slow keystrokes down.
  const handleMouse = useCallback(
    (e: MouseEvent) => {
      if (!enabled || e.button !== 'left') {
        return;
      }
      const bounds = readBounds(boxRef.current);
      if (!bounds || !hitTest(bounds, e)) {
        return;
      }
      if (e.action === 'down') {
        focus(focusId);
      } else if (e.action === 'click') {
        onPress();
      }
    },
    [enabled, focusId, focus, onPress]
  );
  useMouse(handleMouse);

  const accent = VARIANT_COLOR[variant];
  const showShortcut = shortcut.length > 0;
  return (
    <Box ref={boxRef} marginRight={2}>
      {isFocused ? (
        <Text color={accent} bold>
          ▸{' '}
        </Text>
      ) : null}
      {showShortcut ? (
        <Text color={enabled ? accent : undefined} dimColor={!enabled} bold={enabled || isFocused}>
          [{formatShortcut(shortcut)}]
        </Text>
      ) : null}
      <Text dimColor={!enabled} bold={isFocused}>
        {showShortcut ? ' ' : ''}
        {children}
      </Text>
    </Box>
  );
}

/** Render a key spec in a way that fits a button label:
 *  `ctrl+s` → `^S`, `enter` → `↵`, `escape` → `Esc`, `space` → `␣`,
 *  bare printable chars stay as-is so `[e] enable` keeps reading well. */
function formatShortcut(spec: string): string {
  if (spec.length === 1) {
    return spec;
  }
  const lower = spec.toLowerCase();
  if (lower.startsWith('ctrl+') && spec.length === 6) {
    return `^${spec.slice(5).toUpperCase()}`;
  }
  if (lower.startsWith('shift+') && spec.length === 7) {
    return `⇧${spec.slice(6).toUpperCase()}`;
  }
  const labels: Readonly<Record<string, string>> = {
    enter: '↵',
    return: '↵',
    escape: 'Esc',
    esc: 'Esc',
    tab: 'Tab',
    space: '␣',
    backspace: '⌫',
    delete: 'Del',
    uparrow: '↑',
    downarrow: '↓',
    leftarrow: '←',
    rightarrow: '→',
    pageup: 'PgUp',
    pagedown: 'PgDn',
    pgup: 'PgUp',
    pgdn: 'PgDn',
  };
  return labels[lower] ?? spec;
}
