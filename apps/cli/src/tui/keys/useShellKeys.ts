/**
 * Global keybinds active on every section of the brika TUI.
 *
 * Two tiers:
 *
 *   - Plain letters for *navigation* (`d`/`p`/`w`/`l`/`u`/`g`/`,`/`?`)
 *     and `q` for quit — universal terminal convention. Gated by
 *     `!isInputCaptured` so a focused `<Input>` / `<Form>` /
 *     `<Confirm>` eats keystrokes before they reach the shell.
 *   - **Ctrl-modified** for *actions* that change state
 *     (`Ctrl+S`/`Ctrl+X`/`Ctrl+R`/`Ctrl+O`). Can't be typed by
 *     accident in a text field, so they stay live regardless.
 *
 * `Ctrl+C` stays live as a hard escape hatch.
 */

import { useKey, useRouter, useTuiShell } from '@brika/tui';
import type { Routes } from '../routes';
import { useCli } from '../useCli';

export function useShellKeys(): void {
  const router = useRouter<Routes>();
  const { onQuit, isInputCaptured } = useTuiShell();
  const cli = useCli();
  const navActive = !isInputCaptured;

  useKey('q', () => onQuit(), navActive);
  useKey('ctrl+c', () => onQuit()); // always live — escape hatch

  useKey('d', () => router.navigate('dashboard'), navActive);
  useKey('p', () => router.navigate('plugins'), navActive);
  useKey('w', () => router.navigate('workflows'), navActive);
  useKey('l', () => router.navigate('logs'), navActive);
  useKey('u', () => router.navigate('users'), navActive);
  useKey('g', () => router.navigate('updates'), navActive);
  useKey(',', () => router.navigate('settings'), navActive);
  useKey('x', () => router.navigate('playground'), navActive);
  useKey('b', () => router.navigate('brix'), navActive);
  useKey('?', () => router.navigate('help'), navActive);

  useKey('ctrl+s', () => void cli.startHub());
  useKey('ctrl+x', () => void cli.stopHub());
  useKey('ctrl+r', () => void cli.restartHub());
  useKey('ctrl+o', () => void cli.openUi());
}
