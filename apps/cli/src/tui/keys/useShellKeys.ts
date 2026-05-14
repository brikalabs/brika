/**
 * Global keybinds active on every section of the brika TUI.
 *
 * Two tiers:
 *
 *   - Plain letters for *navigation* (`d`/`p`/`w`/`l`/`u`/`g`/`,`/`?`)
 *     and `q` for quit — universal terminal convention. Gated by
 *     `isInputCaptured` so forms own their keystrokes.
 *   - **Ctrl-modified** for *actions* that change state
 *     (`Ctrl+S`/`Ctrl+X`/`Ctrl+R`/`Ctrl+O`). These can't be typed by
 *     accident in a text field, so they're discoverable + safe even
 *     if a form forgets to call `useCaptureInput()`.
 *
 * `Ctrl+C` stays live regardless of capture, as a hard escape hatch.
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

  // Section hotkeys (navigation — plain letters).
  useKey('d', () => router.navigate('dashboard'), active);
  useKey('p', () => router.navigate('plugins'), active);
  useKey('w', () => router.navigate('workflows'), active);
  useKey('l', () => router.navigate('logs'), active);
  useKey('u', () => router.navigate('users'), active);
  useKey('g', () => router.navigate('updates'), active);
  useKey(',', () => router.navigate('settings'), active);
  useKey('?', () => router.navigate('help'), active);

  // Hub control (state-changing — Ctrl-modified so a plain `s` in a
  // password field can never stop the hub).
  useKey('ctrl+s', () => void cli.startHub());
  useKey('ctrl+x', () => void cli.stopHub());
  useKey('ctrl+r', () => void cli.restartHub());
  useKey('ctrl+o', () => void cli.openUi());
}
