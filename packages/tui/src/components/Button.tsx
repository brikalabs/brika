/**
 * `<Button>` — keyboard + mouse + Tab-reachable action button.
 *
 *   <Button shortcut="e" onPress={enable} variant="success">enable</Button>
 *   <Button shortcut="X" onPress={uninstall} variant="destructive">uninstall</Button>
 *
 *   →   [e] enable     [X] uninstall          (default row)
 *      ▸[e] enable     [X] uninstall          (Tab-focused; first slot)
 *
 * Three activation paths, one component:
 *   - Press the `shortcut` (global, auto-suspended during input
 *     capture from `<Input>` / `<Form>` / `<Confirm>`).
 *   - Tab onto the button + Enter / Space.
 *   - Mouse-click anywhere on the chip + label.
 *
 * Variants: `default` (cyan) · `success` (green) · `warning` (yellow) ·
 * `destructive` (red) · `ghost` (no accent on the label, chip only).
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { type ReactNode, useRef } from 'react';
import { useFocusable } from '../keys/useFocusable';
import { useShortcut } from '../keys/useShortcut';

export type ButtonVariant = 'default' | 'success' | 'warning' | 'destructive' | 'ghost';

export interface ButtonProps {
  /** Key spec — `e`, `D`, `ctrl+s`, `enter`, … Pass empty string to
   *  drop the chip and keybind while keeping click + Tab-Enter. */
  readonly shortcut: string;
  readonly onPress: () => void;
  /** Disable the button. Default `true` (enabled). */
  readonly enabled?: boolean;
  readonly variant?: ButtonVariant;
  /** Tab order. `-1` opts out of the Tab cycle. Default `0`. */
  readonly tabIndex?: number;
  /** Stable focus id. Auto-generated when omitted. */
  readonly id?: string;
  readonly autoFocus?: boolean;
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
  tabIndex,
  id,
  autoFocus,
  children,
}: Readonly<ButtonProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const { isFocused } = useFocusable({
    id,
    tabIndex,
    autoFocus,
    onPress,
    enabled,
    ref,
  });
  useShortcut(shortcut, onPress, enabled && shortcut.length > 0);

  const accent = VARIANT_COLOR[variant];
  const showShortcut = shortcut.length > 0;
  return (
    <Box ref={ref} marginRight={2}>
      <Text bold color={isFocused ? 'cyan' : undefined}>
        {isFocused ? '▸' : ' '}
      </Text>
      {showShortcut ? (
        <Text color={enabled ? accent : undefined} dimColor={!enabled} bold={enabled}>
          {' ['}
          {formatShortcut(shortcut)}
          {']'}
        </Text>
      ) : null}
      <Text dimColor={!enabled} bold={isFocused}>
        {' '}
        {children}
      </Text>
    </Box>
  );
}

/** Render a key spec in a way that fits a button label:
 *  `ctrl+s` → `^S`, `enter` → `↵`, `escape` → `Esc`, `space` → `␣`.
 *  Bare printable chars stay as-is so `[e] enable` keeps reading well. */
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
