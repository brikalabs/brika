/**
 * Layer 1 — Elevation roles
 *
 * Two tiers:
 *   - Numeric scale (`shadow-xs..2xl`) — tunable per theme; the cascade
 *     resolves regardless of Tailwind preflight behaviour. Themes can
 *     flatten these to `none` (Brutalist/Terminal) or push them harder
 *     (Skeuomorph) without touching Tailwind.
 *   - Semantic aliases (`shadow-surface/raised/overlay/modal/spotlight`)
 *     point at the numeric scale by default.
 *
 * Tabular `[name, value, description, alias]` form expanded by a
 * builder so per-token boilerplate stays in one place.
 */

import type { TokenSpec } from '../types';

type ShadowEntry = readonly [
  name: string,
  defaultLight: string,
  description: string,
  alias: string,
];

function toShadowRole([name, defaultLight, description, utilityAlias]: ShadowEntry): TokenSpec {
  return {
    name,
    layer: 'role',
    category: 'elevation',
    defaultLight,
    description,
    tailwindNamespace: 'shadow',
    utilityAlias,
  };
}

const NUMERIC_DEFS: readonly ShadowEntry[] = [
  [
    'shadow-xs',
    '0 1px rgb(0 0 0 / 0.05)',
    'Smallest numeric shadow. Underpins `shadow-surface`.',
    'xs',
  ],
  [
    'shadow-sm',
    '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    'Small numeric shadow. Underpins `shadow-raised`.',
    'sm',
  ],
  [
    'shadow-md',
    '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    'Medium numeric shadow. Underpins `shadow-overlay`.',
    'md',
  ],
  [
    'shadow-lg',
    '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    'Large numeric shadow. Underpins `shadow-modal`.',
    'lg',
  ],
  [
    'shadow-xl',
    '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    'Extra-large numeric shadow. Underpins `shadow-spotlight`.',
    'xl',
  ],
  [
    'shadow-2xl',
    '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    'Heaviest numeric shadow. Skeuomorph-style elevation.',
    '2xl',
  ],
];

const SEMANTIC_DEFS: readonly ShadowEntry[] = [
  [
    'shadow-surface',
    'var(--shadow-xs)',
    'Subtle resting elevation (inline cards, quiet chrome).',
    'surface',
  ],
  ['shadow-raised', 'var(--shadow-sm)', 'Cards and buttons at rest or hover.', 'raised'],
  [
    'shadow-overlay',
    'var(--shadow-md)',
    'Popovers, dropdowns, tooltips — anything floating.',
    'overlay',
  ],
  ['shadow-modal', 'var(--shadow-lg)', 'Dialogs and sheets that command focus.', 'modal'],
  [
    'shadow-spotlight',
    'var(--shadow-xl)',
    'Toasts and command palettes — most-elevated transient surfaces.',
    'spotlight',
  ],
];

export const ELEVATION_ROLES: readonly TokenSpec[] = [...NUMERIC_DEFS, ...SEMANTIC_DEFS].map(
  toShadowRole
);
