/**
 * Layer 1 — Material-inspired typography scale.
 *
 * Five families × three sizes (lg / md / sm) = 15 size tiers, each
 * paired with a line-height. Sizes derive from `--text-base` so a theme
 * can re-scale the entire typography system by tuning the scalar.
 *
 * `tailwindNamespace: 'text'` registers the sizes as `text-display-lg`,
 * `text-headline-md`, etc. utilities. The plugin emits the paired
 * line-height as `--<name>--line-height` (Tailwind v4's convention for
 * size tokens that carry a default line-height).
 */

import type { TokenSpec } from '../types';

type ScaleEntry = readonly [alias: string, sizeMultiplier: number, lineHeightMultiplier: number];

function calc(multiplier: number): string {
  return `calc(var(--text-base, 1rem) * ${multiplier})`;
}

function toScaleRole([alias, sizeM, lineHeightM]: ScaleEntry): TokenSpec {
  return {
    name: `text-${alias}`,
    layer: 'role',
    category: 'typography',
    type: 'font-size',
    defaultLight: calc(sizeM),
    lineHeight: calc(lineHeightM),
    description: `\`text-${alias}\` typography tier (size + line-height pair).`,
    tailwindNamespace: 'text',
    utilityAlias: alias,
  };
}

const SCALE_DEFS: readonly ScaleEntry[] = [
  ['display-lg', 3.5625, 4],
  ['display-md', 2.8125, 3.25],
  ['display-sm', 2.25, 2.75],
  ['headline-lg', 2, 2.5],
  ['headline-md', 1.75, 2.25],
  ['headline-sm', 1.5, 2],
  ['title-lg', 1.375, 1.75],
  ['title-md', 1, 1.5],
  ['title-sm', 0.875, 1.25],
  ['body-lg', 1, 1.5],
  ['body-md', 0.875, 1.25],
  ['body-sm', 0.75, 1.125],
  ['label-lg', 0.875, 1.25],
  ['label-md', 0.75, 1.125],
  ['label-sm', 0.6875, 1],
];

export const TYPOGRAPHY_SCALE_ROLES: readonly TokenSpec[] = SCALE_DEFS.map(toScaleRole);
