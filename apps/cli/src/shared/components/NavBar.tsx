/**
 * `<NavBar>` — thin router-bound wrapper around the generic
 * `<MenuBar>` primitive. Sections come from `NAV_SECTIONS` so adding
 * a new top-level area is a one-line edit.
 *
 * Mouse-clickable; keyboard shortcuts live in `useShellKeys` so they
 * fire from any context (forms, search, etc.).
 */

import { MenuBar, useRouter } from '@brika/tui';
import type React from 'react';
import type { Routes } from '../../routes';
import { NAV_SECTIONS } from '../../sections';

export function NavBar(): React.ReactElement {
  const router = useRouter<Routes>();
  return (
    <MenuBar
      items={NAV_SECTIONS.map((s) => ({ key: s.key, label: s.label, hotkey: s.hotkey }))}
      active={router.current.name}
      onSelect={(key) => router.navigate(key)}
      accent="cyan"
    />
  );
}
