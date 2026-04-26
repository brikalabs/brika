/**
 * Layer 1 — Color roles
 * Themes typically override these. Listed in the order they appear in
 * existing presets to make migration mechanical.
 *
 * The list is authored as a tabular `[name, light, dark, description]`
 * array and expanded into TokenSpecs by `toColorRole` so the per-token
 * boilerplate (`layer`, `category`, `themePath`, `tailwindNamespace`)
 * stays in one place.
 */

import type { TokenSpec } from '../types';

/** Convert kebab-case to camelCase for theme paths. */
function camel(name: string): string {
  return name.replaceAll(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

type ColorEntry = readonly [name: string, light: string, dark: string, description: string];

function toColorRole([name, defaultLight, defaultDark, description]: ColorEntry): TokenSpec {
  return {
    name,
    layer: 'role',
    category: 'color',
    defaultLight,
    defaultDark,
    description,
    themePath: `colors.${camel(name)}`,
    tailwindNamespace: 'color',
  };
}

const COLOR_DEFS: readonly ColorEntry[] = [
  // Surface
  [
    'background',
    'oklch(0.99 0 0)',
    'oklch(0.14 0.02 260)',
    'Page background. The base canvas every surface sits on.',
  ],
  [
    'foreground',
    'oklch(0.15 0.01 260)',
    'oklch(0.96 0.01 260)',
    'Default text color, paired with `background`.',
  ],
  ['card', 'oklch(1 0 0)', 'oklch(0.17 0.02 260)', 'Background for resting cards and panels.'],
  [
    'card-foreground',
    'oklch(0.15 0.01 260)',
    'oklch(0.96 0.01 260)',
    'Text color for content inside cards.',
  ],
  [
    'popover',
    'oklch(1 0 0)',
    'oklch(0.17 0.02 260)',
    'Background for floating surfaces (popovers, dropdowns, tooltips).',
  ],
  [
    'popover-foreground',
    'oklch(0.15 0.01 260)',
    'oklch(0.96 0.01 260)',
    'Text color for content inside popovers.',
  ],

  // Brand
  [
    'primary',
    'oklch(0.55 0.18 265)',
    'oklch(0.7 0.16 265)',
    'Brand primary. Used for filled buttons, focus ring, links.',
  ],
  [
    'primary-foreground',
    'oklch(0.99 0 0)',
    'oklch(0.14 0.02 260)',
    'Text color that reads on `primary` backgrounds.',
  ],
  [
    'secondary',
    'oklch(0.94 0.005 260)',
    'oklch(0.22 0.02 260)',
    'Secondary surfaces and quiet button fills.',
  ],
  [
    'secondary-foreground',
    'oklch(0.15 0.01 260)',
    'oklch(0.96 0.01 260)',
    'Text color paired with `secondary`.',
  ],
  [
    'muted',
    'oklch(0.95 0.005 260)',
    'oklch(0.2 0.02 260)',
    'Subdued surface for placeholder content and inactive rails.',
  ],
  [
    'muted-foreground',
    'oklch(0.5 0.01 260)',
    'oklch(0.65 0.02 260)',
    'De-emphasized text (helper copy, captions, placeholders).',
  ],
  [
    'accent',
    'oklch(0.92 0.01 260)',
    'oklch(0.25 0.02 260)',
    'Hover/highlight surface for interactive items in menus and lists.',
  ],
  [
    'accent-foreground',
    'oklch(0.15 0.01 260)',
    'oklch(0.96 0.01 260)',
    'Text color paired with `accent`.',
  ],
  [
    'border',
    'oklch(0.9 0.01 260)',
    'oklch(0.25 0.02 260)',
    'Default border color across the system.',
  ],
  [
    'input',
    'oklch(0.9 0.01 260)',
    'oklch(0.25 0.02 260)',
    'Border color for input controls (input, select, textarea).',
  ],
  [
    'ring',
    'oklch(0.55 0.18 265)',
    'oklch(0.7 0.16 265)',
    'Focus ring color. Defaults to `primary`.',
  ],

  // Feedback
  [
    'success',
    'oklch(0.55 0.16 145)',
    'oklch(0.72 0.15 145)',
    'Positive feedback (success toasts, confirmation states).',
  ],
  [
    'success-foreground',
    'oklch(0.99 0 0)',
    'oklch(0.14 0.02 260)',
    'Text color paired with `success`.',
  ],
  [
    'warning',
    'oklch(0.65 0.14 85)',
    'oklch(0.8 0.15 85)',
    'Cautionary feedback (warning banners, caution states).',
  ],
  [
    'warning-foreground',
    'oklch(0.15 0.01 260)',
    'oklch(0.14 0.02 260)',
    'Text color paired with `warning`.',
  ],
  [
    'info',
    'oklch(0.5 0.18 230)',
    'oklch(0.72 0.12 230)',
    'Informational feedback (tips, notes, neutral accents).',
  ],
  ['info-foreground', 'oklch(0.99 0 0)', 'oklch(0.14 0.02 260)', 'Text color paired with `info`.'],
  [
    'destructive',
    'oklch(0.55 0.22 25)',
    'oklch(0.65 0.2 25)',
    'Destructive actions (delete buttons, error states).',
  ],
  [
    'destructive-foreground',
    'oklch(0.99 0 0)',
    'oklch(0.96 0.01 260)',
    'Text color paired with `destructive`.',
  ],
];

export const COLOR_ROLES: readonly TokenSpec[] = COLOR_DEFS.map(toColorRole);
