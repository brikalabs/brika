/**
 * Layer 1 — Geometry roles
 * Semantic radii derived from the base `--radius` scalar.
 */

import type { TokenSpec } from '../types';

export const GEOMETRY_ROLES: readonly TokenSpec[] = [
  {
    name: 'radius-tight',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'max(0rem, calc(var(--radius) - 0.625rem))',
    description: 'Tight radius for tag dots and micro shapes.',
    tailwindNamespace: 'radius',
    utilityAlias: 'tight',
  },
  {
    name: 'radius-pill',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'max(0rem, calc(var(--radius) - 0.375rem))',
    description: 'Pill radius for chips, tags, and badges.',
    tailwindNamespace: 'radius',
    utilityAlias: 'pill',
  },
  {
    name: 'radius-control',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'max(0rem, calc(var(--radius) - 0.25rem))',
    description: 'Radius for buttons, inputs, switches and other controls.',
    tailwindNamespace: 'radius',
    utilityAlias: 'control',
  },
  {
    name: 'radius-container',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'var(--radius)',
    description: 'Radius for cards, panels, sidebars.',
    tailwindNamespace: 'radius',
    utilityAlias: 'container',
  },
  {
    name: 'radius-surface',
    layer: 'role',
    category: 'geometry',
    defaultLight: 'calc(var(--radius) + 0.25rem)',
    description: 'Radius for dialogs, sheets, popovers — surfaces that float.',
    tailwindNamespace: 'radius',
    utilityAlias: 'surface',
  },
];
