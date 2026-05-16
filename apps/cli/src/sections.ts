/**
 * Top-nav-visible sections. Kept in its own module (separate from
 * `routes.ts`) so the help view + nav bar can pull the table without
 * forming an import cycle through the route → view → table loop.
 *
 * Number keys 1-8 are used as section hotkeys — they almost never
 * collide with content keys, unlike single letters (which conflicted
 * with `D`/`e`/`R`/etc. in the Plugins view). `[` and `]` cycle to the
 * previous / next section. `?` opens help. None of these keys clash
 * with form inputs (the `useKey` capture model auto-suppresses them
 * whenever an `<Input>`-family component is mounted).
 */

import type { Routes } from './routes';

export interface SectionEntry {
  readonly key: keyof Routes;
  readonly label: string;
  /** Number key (1-8) to jump straight here. */
  readonly hotkey: string;
}

export const NAV_SECTIONS: ReadonlyArray<SectionEntry> = [
  { key: 'dashboard', label: 'Dashboard', hotkey: '1' },
  { key: 'plugins', label: 'Plugins', hotkey: '2' },
  { key: 'workflows', label: 'Workflows', hotkey: '3' },
  { key: 'logs', label: 'Logs', hotkey: '4' },
  { key: 'users', label: 'Users', hotkey: '5' },
  { key: 'updates', label: 'Updates', hotkey: '6' },
  { key: 'settings', label: 'Settings', hotkey: '7' },
  { key: 'brix', label: 'Brix', hotkey: '8' },
];
