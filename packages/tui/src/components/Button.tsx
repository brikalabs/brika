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

import { Box, type DOMElement, Text, useFocus, useFocusManager, useInput } from 'ink';
import type React from 'react';
import { type ReactNode, useCallback, useRef } from 'react';
import { useKey } from '../keys/useKey';
import { hitTest, useBounds } from '../mouse/useBounds';
import { useMouse } from '../mouse/useMouse';

export type ButtonVariant = 'default' | 'success' | 'warning' | 'destructive' | 'ghost';

export interface ButtonProps {
  /** Key spec passed to `useKey` — `e`, `D`, `ctrl+s`, etc. */
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
  children,
}: Readonly<ButtonProps>): React.ReactElement {
  const { isFocused } = useFocus({ autoFocus, id, isActive: enabled });
  const { focus } = useFocusManager();
  const boxRef = useRef<DOMElement>(null);
  const bounds = useBounds(boxRef);

  useKey(shortcut, onPress, enabled);
  useInput(
    (input, key) => {
      if (key.return || input === ' ') {
        onPress();
      }
    },
    { isActive: enabled && isFocused }
  );

  // Mouse: focus on hover-press, fire on click — only when the
  // bounds are within the clicked cell. `useMouse` returns events
  // for the whole terminal, so each button filters on its own rect.
  const handleMouse = useCallback(
    (e: { action: string; button: string; column: number; row: number }) => {
      if (!enabled || !bounds || e.button !== 'left') {
        return;
      }
      if (!hitTest(bounds, e)) {
        return;
      }
      if (e.action === 'down' && id) {
        focus(id);
      } else if (e.action === 'click') {
        onPress();
      }
    },
    [enabled, bounds, id, focus, onPress]
  );
  useMouse(handleMouse);

  const accent = VARIANT_COLOR[variant];
  return (
    <Box ref={boxRef} marginRight={2}>
      {isFocused ? (
        <Text color={accent} bold>
          ▸{' '}
        </Text>
      ) : null}
      <Text color={enabled ? accent : undefined} dimColor={!enabled} bold={enabled || isFocused}>
        [{shortcut}]
      </Text>
      <Text dimColor={!enabled} bold={isFocused}>
        {' '}
        {children}
      </Text>
    </Box>
  );
}
