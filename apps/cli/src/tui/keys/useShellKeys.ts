/**
 * Global keybinds active on every section of the brika TUI.
 *
 * `useKey` is capture-aware automatically — when an `<Input>` /
 * `<Confirm>` / `<Form>` is mounted, every plain bind here goes
 * dormant. No flags at the call site; the engine handles it.
 *
 * Section navigation is driven by `NAV_SECTIONS` so the bindings
 * never drift from the menu bar. Number keys (1-8) handle direct
 * jumps; `[` and `]` cycle to the previous / next section. Numbers
 * were chosen instead of letters because letter hotkeys collided
 * with content-key bindings (`D` to disable a plugin, `e` to enable,
 * `R` to reload, etc.) and felt unsafe even with the capture model.
 *
 * Hub controls (`Ctrl+S` / `Ctrl+X` / `Ctrl+R` / `Ctrl+O`) live on
 * the `<Button>`s in `<ShellFooter>` — the Buttons wire the click,
 * focus + Enter, and shortcut paths in one place, so we don't
 * register the same keybind twice.
 */

import { type KeyMap, useKey, useKeyMap, useRouter, useTuiShell } from '@brika/tui';
import { useMemo } from 'react';
import type { Routes } from '../routes';
import { NAV_SECTIONS } from '../sections';

export function useShellKeys(): void {
  const router = useRouter<Routes>();
  const { onQuit } = useTuiShell();

  useKey('q', () => onQuit());
  // Ctrl+C is handled by ink's `exitOnCtrlC` at the framework layer
  // (always live, never captured) — no useKey needed here.

  // Direct jumps by number key — one capture-aware listener covers
  // every section so the binding set can grow without changing the
  // shape of this hook's React-tree call list.
  const sectionMap = useMemo<KeyMap>(
    () =>
      NAV_SECTIONS.map((section) => ({
        spec: section.hotkey,
        handler: () => router.navigate(section.key),
      })),
    [router]
  );
  useKeyMap(sectionMap);

  // Cycle between sections.
  useKey('[', () => router.navigate(prevSectionKey(router.current.name)));
  useKey(']', () => router.navigate(nextSectionKey(router.current.name)));

  useKey('?', () => router.navigate('help'));
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
