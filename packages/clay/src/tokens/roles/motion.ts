/**
 * Layer 1 — Motion roles
 * Three duration channels (instant, standard, considered) plus matching
 * easing channels. All derived from the `--motion-duration` /
 * `--motion-easing` scalars.
 */

import type { TokenSpec } from '../types';

export const MOTION_ROLES: readonly TokenSpec[] = [
  {
    name: 'motion-instant-duration',
    layer: 'role',
    category: 'motion',
    defaultLight: 'max(80ms, calc(var(--motion-duration, 220ms) * 0.45))',
    description: 'Fastest channel — hover, focus, instant feedback.',
    tailwindNamespace: 'motion',
    utilityAlias: 'instant',
  },
  {
    name: 'motion-standard-duration',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-duration, 220ms)',
    description: 'Default transition channel for most state changes.',
    tailwindNamespace: 'motion',
    utilityAlias: 'standard',
  },
  {
    name: 'motion-considered-duration',
    layer: 'role',
    category: 'motion',
    defaultLight: 'calc(var(--motion-duration, 220ms) * 1.8)',
    description: 'Emphasized reveals — sheets, accordions, accordions.',
    tailwindNamespace: 'motion',
    utilityAlias: 'considered',
  },
  {
    name: 'motion-instant-easing',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-easing, cubic-bezier(0.16, 1, 0.3, 1))',
    description: 'Easing for the instant motion channel.',
  },
  {
    name: 'motion-standard-easing',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-easing, cubic-bezier(0.16, 1, 0.3, 1))',
    description: 'Easing for the standard motion channel.',
  },
  {
    name: 'motion-considered-easing',
    layer: 'role',
    category: 'motion',
    defaultLight: 'var(--motion-easing, cubic-bezier(0.16, 1, 0.3, 1))',
    description: 'Easing for the considered motion channel.',
  },
];
