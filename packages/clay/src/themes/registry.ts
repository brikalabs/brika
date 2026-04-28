import * as presets from './presets';
import type { ThemeConfig } from './types';

/**
 * The full set of first-party Clay themes, in narrative order.
 *
 * **This entry is opt-in.** Importing it pulls every preset JSON into your
 * bundle. Pickers and galleries that need the whole list should import from
 * here; consumers that want a single theme should keep importing it by name
 * from `@brika/clay/themes` (`import { ocean } from '@brika/clay/themes'`)
 * so the bundler can drop the rest.
 *
 * Order is driven by `./presets/index.ts` via `Object.values` — to reorder
 * the picker, reorder the exports there.
 */
export const builtInThemes: readonly ThemeConfig[] = Object.values(presets);

export const builtInThemesById: Readonly<Record<string, ThemeConfig>> = Object.fromEntries(
  builtInThemes.map((theme) => [theme.id, theme])
);
