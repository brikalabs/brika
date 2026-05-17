/**
 * Global keybinds active on every section of the brika TUI.
 *
 * `useShortcut` is capture-aware — when an `<Input>` / `<Confirm>` /
 * `<Form>` is mounted and focused, every plain bind here goes
 * dormant. No flags at the call site; the shell context handles it.
 *
 * Section navigation comes from `NAV_SECTIONS` so the bindings never
 * drift from the menu bar. Numbers were chosen instead of letters
 * because letter hotkeys collided with content-key bindings (`D` to
 * disable a plugin, `e` to enable, `R` to reload, etc.).
 */

import { type ShortcutMap, useRouter, useShortcut, useShortcutMap, useTuiShell } from '@brika/tui';
import { useMemo } from 'react';
import type { Routes } from '../../routes';
import { NAV_SECTIONS } from '../../sections';

export function useShellKeys(): void {
  const router = useRouter<Routes>();
  const { onQuit } = useTuiShell();

  useShortcut('q', () => onQuit());

  const sectionMap = useMemo<ShortcutMap>(
    () =>
      NAV_SECTIONS.map((section) => ({
        spec: section.hotkey,
        handler: () => router.navigate(section.key),
      })),
    [router]
  );
  useShortcutMap(sectionMap);

  useShortcut('[', () => router.navigate(prevSectionKey(router.current.name)));
  useShortcut(']', () => router.navigate(nextSectionKey(router.current.name)));
  useShortcut('?', () => router.navigate('help'));
}

function indexOfRoute(name: string): number {
  const idx = NAV_SECTIONS.findIndex((s) => s.key === name);
  return idx === -1 ? 0 : idx;
}

function nextSectionKey(current: string): keyof Routes {
  const idx = indexOfRoute(current);
  const next = NAV_SECTIONS[(idx + 1) % NAV_SECTIONS.length];
  return next?.key ?? 'dashboard';
}

function prevSectionKey(current: string): keyof Routes {
  const idx = indexOfRoute(current);
  const prev = NAV_SECTIONS[(idx - 1 + NAV_SECTIONS.length) % NAV_SECTIONS.length];
  return prev?.key ?? 'dashboard';
}
