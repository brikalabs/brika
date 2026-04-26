/**
 * Layer 1 — Geometry roles
 * Semantic radii derived from the base `--radius` scalar.
 *
 * Tabular `[alias, value, description]` form expanded by a builder so
 * per-token boilerplate stays in one place.
 */

import type { TokenSpec } from '../types';

type RadiusEntry = readonly [alias: string, defaultLight: string, description: string];

function toRadiusRole([alias, defaultLight, description]: RadiusEntry): TokenSpec {
  return {
    name: `radius-${alias}`,
    layer: 'role',
    category: 'geometry',
    defaultLight,
    description,
    tailwindNamespace: 'radius',
    utilityAlias: alias,
  };
}

const RADIUS_DEFS: readonly RadiusEntry[] = [
  [
    'tight',
    'max(0rem, calc(var(--radius) - 0.625rem))',
    'Tight radius for tag dots and micro shapes.',
  ],
  ['pill', 'max(0rem, calc(var(--radius) - 0.375rem))', 'Pill radius for chips, tags, and badges.'],
  [
    'control',
    'max(0rem, calc(var(--radius) - 0.25rem))',
    'Radius for buttons, inputs, switches and other controls.',
  ],
  ['container', 'var(--radius)', 'Radius for cards, panels, sidebars.'],
  [
    'surface',
    'calc(var(--radius) + 0.25rem)',
    'Radius for dialogs, sheets, popovers — surfaces that float.',
  ],
];

export const GEOMETRY_ROLES: readonly TokenSpec[] = RADIUS_DEFS.map(toRadiusRole);
