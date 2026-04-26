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
 */

import type { TokenSpec } from '../types';

export const ELEVATION_ROLES: readonly TokenSpec[] = [
  // Numeric shadow scale
  {
    name: 'shadow-xs',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 1px rgb(0 0 0 / 0.05)',
    description: 'Smallest numeric shadow. Underpins `shadow-surface`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'xs',
  },
  {
    name: 'shadow-sm',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    description: 'Small numeric shadow. Underpins `shadow-raised`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'sm',
  },
  {
    name: 'shadow-md',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    description: 'Medium numeric shadow. Underpins `shadow-overlay`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'md',
  },
  {
    name: 'shadow-lg',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    description: 'Large numeric shadow. Underpins `shadow-modal`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'lg',
  },
  {
    name: 'shadow-xl',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    description: 'Extra-large numeric shadow. Underpins `shadow-spotlight`.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'xl',
  },
  {
    name: 'shadow-2xl',
    layer: 'role',
    category: 'elevation',
    defaultLight: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    description: 'Heaviest numeric shadow. Skeuomorph-style elevation.',
    tailwindNamespace: 'shadow',
    utilityAlias: '2xl',
  },

  // Semantic shadow aliases
  {
    name: 'shadow-surface',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-xs)',
    description: 'Subtle resting elevation (inline cards, quiet chrome).',
    tailwindNamespace: 'shadow',
    utilityAlias: 'surface',
  },
  {
    name: 'shadow-raised',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-sm)',
    description: 'Cards and buttons at rest or hover.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'raised',
  },
  {
    name: 'shadow-overlay',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-md)',
    description: 'Popovers, dropdowns, tooltips — anything floating.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'overlay',
  },
  {
    name: 'shadow-modal',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-lg)',
    description: 'Dialogs and sheets that command focus.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'modal',
  },
  {
    name: 'shadow-spotlight',
    layer: 'role',
    category: 'elevation',
    defaultLight: 'var(--shadow-xl)',
    description: 'Toasts and command palettes — most-elevated transient surfaces.',
    tailwindNamespace: 'shadow',
    utilityAlias: 'spotlight',
  },
];
