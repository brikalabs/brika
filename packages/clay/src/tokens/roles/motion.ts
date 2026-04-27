/**
 * Layer 1 — Motion roles
 * Three duration channels (instant, standard, considered) plus matching
 * easing channels. All derived from the `--motion-duration` /
 * `--motion-easing` scalars.
 */

import type { TokenSpec } from '../types';

const DEFAULT_EASING = 'var(--motion-easing, cubic-bezier(0.16, 1, 0.3, 1))';

type DurationEntry = readonly [channel: string, defaultLight: string, description: string];

function toDurationRole([channel, defaultLight, description]: DurationEntry): TokenSpec {
  return {
    name: `motion-${channel}-duration`,
    layer: 'role',
    category: 'motion',
    defaultLight,
    description,
    tailwindNamespace: 'motion',
    utilityAlias: channel,
  };
}

function toEasingRole(channel: string): TokenSpec {
  return {
    name: `motion-${channel}-easing`,
    layer: 'role',
    category: 'motion',
    defaultLight: DEFAULT_EASING,
    description: `Easing for the ${channel} motion channel.`,
  };
}

const DURATION_DEFS: readonly DurationEntry[] = [
  [
    'instant',
    'max(80ms, calc(var(--motion-duration, 220ms) * 0.45))',
    'Fastest channel — hover, focus, instant feedback.',
  ],
  [
    'standard',
    'var(--motion-duration, 220ms)',
    'Default transition channel for most state changes.',
  ],
  [
    'considered',
    'calc(var(--motion-duration, 220ms) * 1.8)',
    'Emphasized reveals — sheets, accordions, accordions.',
  ],
];

export const MOTION_ROLES: readonly TokenSpec[] = [
  ...DURATION_DEFS.map(toDurationRole),
  ...DURATION_DEFS.map(([channel]) => toEasingRole(channel)),
];
