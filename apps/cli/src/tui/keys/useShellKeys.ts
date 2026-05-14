/**
 * Global keybinds active on every section of the brika TUI.
 *
 * - Section letters (`d`, `p`, `w`, `l`, `u`, `g`, `,`, `?`) jump
 *   straight to that route.
 * - Action letters (`s`, `x`, `r`, `o`) trigger the hub-control
 *   callbacks the CliProvider exposes.
 * - `q` / `Ctrl+C` quit via the shell's `onQuit`.
 *
 * Every binding suspends when `isInputCaptured` is set — so a form's
 * keystrokes don't double-fire as hub actions / route jumps. Forms
 * call `useCaptureInput()` to bump the counter for their lifetime.
 * `Ctrl+C` is the one exception: we keep it live so a stuck form
 * can always be killed.
 */

import { useKey, useRouter, useTuiShell } from '@brika/tui';
import type { Routes } from '../routes';
import { useCli } from '../useCli';

export function useShellKeys(): void {
  const router = useRouter<Routes>();
  const { onQuit, isInputCaptured } = useTuiShell();
  const cli = useCli();
  const active = !isInputCaptured;

  useKey('q', () => onQuit(), active);
  useKey('ctrl+c', () => onQuit()); // always live — escape hatch

  // Section hotkeys.
  useKey('d', () => router.navigate('dashboard'), active);
  useKey('p', () => router.navigate('plugins'), active);
  useKey('w', () => router.navigate('workflows'), active);
  useKey('l', () => router.navigate('logs'), active);
  useKey('u', () => router.navigate('users'), active);
  useKey('g', () => router.navigate('updates'), active);
  useKey(',', () => router.navigate('settings'), active);
  useKey('?', () => router.navigate('help'), active);

  // Hub control.
  useKey('s', () => void cli.startHub(), active);
  useKey('x', () => void cli.stopHub(), active);
  useKey('r', () => void cli.restartHub(), active);
  useKey('o', () => void cli.openUi(), active);
}
