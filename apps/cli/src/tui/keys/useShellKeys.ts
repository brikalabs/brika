/**
 * Global keybinds active on every section of the brika TUI.
 *
 * `useKey` is capture-aware automatically — when an `<Input>` /
 * `<Confirm>` / `<Form>` is mounted, every plain bind here goes
 * dormant. No flags at the call site; the engine handles it.
 *
 * The Ctrl-modified hub controls bypass the capture model the
 * same way they did before (a `Ctrl+S` in a password field is
 * never a typo).
 */

import { useKey, useRouter, useTuiShell } from '@brika/tui';
import type { Routes } from '../routes';
import { useCli } from '../useCli';

export function useShellKeys(): void {
  const router = useRouter<Routes>();
  const { onQuit } = useTuiShell();
  const cli = useCli();

  useKey('q', () => onQuit());
  // Ctrl+C is handled by ink's `exitOnCtrlC` at the framework layer
  // (always live, never captured) — no useKey needed here.

  useKey('d', () => router.navigate('dashboard'));
  useKey('p', () => router.navigate('plugins'));
  useKey('w', () => router.navigate('workflows'));
  useKey('l', () => router.navigate('logs'));
  useKey('u', () => router.navigate('users'));
  useKey('g', () => router.navigate('updates'));
  useKey(',', () => router.navigate('settings'));
  useKey('x', () => router.navigate('playground'));
  useKey('b', () => router.navigate('brix'));
  useKey('?', () => router.navigate('help'));

  useKey('ctrl+s', () => void cli.startHub());
  useKey('ctrl+x', () => void cli.stopHub());
  useKey('ctrl+r', () => void cli.restartHub());
  useKey('ctrl+o', () => void cli.openUi());
}
