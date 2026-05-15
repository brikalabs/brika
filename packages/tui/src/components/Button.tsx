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

import { Box, Text } from 'ink';
import type React from 'react';
import type { ReactNode } from 'react';
import { useKey } from '../keys/useKey';

export type ButtonVariant = 'default' | 'success' | 'warning' | 'destructive' | 'ghost';

export interface ButtonProps {
  /** Key spec passed to `useKey` — `e`, `D`, `ctrl+s`, etc. */
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
  useKey(shortcut, onPress, enabled);
  const accent = VARIANT_COLOR[variant];
  return (
    <Box marginRight={2}>
      <Text color={enabled ? accent : undefined} dimColor={!enabled} bold={enabled}>
        [{shortcut}]
      </Text>
      <Text dimColor={!enabled}> {children}</Text>
    </Box>
  );
}
