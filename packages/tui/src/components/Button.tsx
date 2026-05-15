/**
 * `<Button>` — keyboard-shortcut action, the TUI equivalent of a
 * shadcn button. The visible glyph IS the shortcut hint:
 *
 *   <Button shortcut="e" onPress={enable} variant="success">Enable</Button>
 *   <Button shortcut="X" onPress={uninstall} variant="destructive">Uninstall</Button>
 *
 *   →  [e] Enable     [X] Uninstall
 *
 * Activation lives in the dispatch tree, not on the button itself.
 * The shortcut registers with the nearest `<FocusScope>` ancestor via
 * `useShortcut`, so it fires only while that scope is on the focus
 * path — no `<FocusScope>` ancestor = the chip is decorative + the
 * mouse click still works, but the keybind is inert by design.
 *
 * Variants:
 *   - `default`     — cyan accent, the neutral action.
 *   - `success`     — green.
 *   - `warning`     — yellow.
 *   - `destructive` — red.
 *   - `ghost`       — no accent on the label, just the shortcut.
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { type ReactNode, useCallback, useRef } from 'react';
import { useShortcut } from '../keys/dispatch';
import { hitTest, readBounds } from '../mouse/useBounds';
import { type MouseEvent, useMouse } from '../mouse/useMouse';

export type ButtonVariant = 'default' | 'success' | 'warning' | 'destructive' | 'ghost';

export interface ButtonProps {
  /** Key spec passed to `useShortcut` — `e`, `D`, `ctrl+s`, `enter`,
   *  `escape`, etc. The display in `[…]` is pretty-printed (`^S`,
   *  `↵`, `Esc`). Pass an empty string to skip the chip + keybind
   *  entirely while keeping the click target. */
  readonly shortcut: string;
  readonly onPress: () => void;
  /** Disable the binding (and dim the label). Default `true`. */
  readonly enabled?: boolean;
  readonly variant?: ButtonVariant;
  readonly children?: ReactNode;
}

const VARIANT_COLOR: Readonly<Record<ButtonVariant, string | undefined>> = {
  default: 'cyan',
  success: 'green',
  warning: 'yellow',
  destructive: 'red',
  ghost: undefined,
};

export function Button({
  shortcut,
  onPress,
  enabled = true,
  variant = 'default',
  children,
}: Readonly<ButtonProps>): React.ReactElement {
  const boxRef = useRef<DOMElement>(null);

  // Scope-gated keybind. Fires only when an ancestor `<FocusScope>` is
  // on the current focus path; no scope = no keybind (click only).
  useShortcut(shortcut, onPress, enabled && shortcut.length > 0);

  // Mouse: click fires `onPress` regardless of scope — clicks are
  // intentional in a way arbitrary keystrokes aren't.
  const handleMouse = useCallback(
    (e: MouseEvent) => {
      if (!enabled || e.button !== 'left' || e.action !== 'click') {
        return;
      }
      const bounds = readBounds(boxRef.current);
      if (bounds && hitTest(bounds, e)) {
        onPress();
      }
    },
    [enabled, onPress]
  );
  useMouse(handleMouse);

  const accent = VARIANT_COLOR[variant];
  const showShortcut = shortcut.length > 0;
  return (
    <Box ref={boxRef} marginRight={2}>
      {showShortcut ? (
        <Text color={enabled ? accent : undefined} dimColor={!enabled} bold={enabled}>
          [{formatShortcut(shortcut)}]
        </Text>
      ) : null}
      <Text dimColor={!enabled}>
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
