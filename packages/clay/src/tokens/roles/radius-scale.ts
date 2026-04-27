/**
 * Layer 1 — Tailwind radius scale (theme-aware).
 *
 * Tailwind v4 ships built-in `--radius-sm` … `--radius-3xl` as fixed
 * pixel/rem values. Clay re-derives them from the user's `--radius`
 * scalar so `rounded-sm`, `rounded-md`, `rounded-2xl`, etc. all scale
 * with the active theme. Each token emits a `:root` value that
 * overrides Tailwind's default at source-order (clay's stylesheet
 * loads after Tailwind's `@theme`).
 *
 * `tailwindNamespace: 'none'` keeps these out of `theme.extend` —
 * Tailwind already generates the matching utilities from its own
 * default theme, and we only need the `:root` override.
 */

import type { TokenSpec } from '../types';

type RadiusScaleEntry = readonly [alias: string, defaultLight: string, description: string];

const RADIUS_SCALE_DEFS: readonly RadiusScaleEntry[] = [
  ['sm', 'max(0rem, calc(var(--radius) - 0.375rem))', 'Theme-aware `rounded-sm`.'],
  ['md', 'max(0rem, calc(var(--radius) - 0.25rem))', 'Theme-aware `rounded-md`.'],
  ['lg', 'var(--radius)', 'Theme-aware `rounded-lg`.'],
  ['xl', 'calc(var(--radius) + 0.25rem)', 'Theme-aware `rounded-xl`.'],
  ['2xl', 'calc(var(--radius) + 0.5rem)', 'Theme-aware `rounded-2xl`.'],
  ['3xl', 'calc(var(--radius) + 1rem)', 'Theme-aware `rounded-3xl`.'],
];

function toRadiusScaleRole([alias, defaultLight, description]: RadiusScaleEntry): TokenSpec {
  return {
    name: `radius-${alias}`,
    layer: 'role',
    category: 'geometry',
    defaultLight,
    description,
    tailwindNamespace: 'none',
  };
}

export const RADIUS_SCALE_ROLES: readonly TokenSpec[] = RADIUS_SCALE_DEFS.map(toRadiusScaleRole);
