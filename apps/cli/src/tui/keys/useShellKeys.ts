/**
 * Global keybinds active on every section of the brika TUI.
 *
 * - Section letters (`d`, `p`, `w`, `l`, `u`, `g`, `,`, `?`) jump
 *   straight to that route.
 * - Action letters (`s`, `x`, `r`, `o`) trigger the hub-control
 *   callbacks the CliProvider exposes.
 * - `q` / `Ctrl+C` quit via the shell's `onQuit`.
 *
 * Mounted once from `<App>` so they're alive on every route. Section
 * views can still register their OWN `useKey` calls for in-section
 * navigation — ink stacks `useInput` registrations.
 *
 * Each section's hotkey is bound explicitly (rather than in a loop)
 * to keep the `useKey` call order stable across renders — that's
 * what React's rules of hooks require.
 */

import { useKey, useRouter, useTuiShell } from '@brika/tui';
import type { Routes } from '../routes';
import { useCli } from '../useCli';

export function useShellKeys(): void {
  const router = useRouter<Routes>();
  const { onQuit } = useTuiShell();
  const cli = useCli();

  useKey('q', () => onQuit());
  useKey('ctrl+c', () => onQuit());

  // Section hotkeys — keep in sync with `SIDEBAR_SECTIONS` in routes.ts.
  useKey('d', () => router.navigate('dashboard'));
  useKey('p', () => router.navigate('plugins'));
  useKey('w', () => router.navigate('workflows'));
  useKey('l', () => router.navigate('logs'));
  useKey('u', () => router.navigate('users'));
  useKey('g', () => router.navigate('updates'));
  useKey(',', () => router.navigate('settings'));
  useKey('?', () => router.navigate('help'));

  // Hub-control actions, global so they work from any section.
  useKey('s', () => void cli.startHub());
  useKey('x', () => void cli.stopHub());
  useKey('r', () => void cli.restartHub());
  useKey('o', () => void cli.openUi());
}
