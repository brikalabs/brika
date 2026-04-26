/**
 * Layer-2 tokens for components that don't yet have a `src/components/<name>/`
 * folder. When one of those components ships, move its block into the
 * component's own `tokens.ts` and delete the corresponding entry here.
 */

import { registerTokens } from './component-registry';
import { meta as buildMeta, controlSurfaceTokens, defineComponentTokens } from './expand';

const alert = buildMeta('alert');
const checkbox = buildMeta('checkbox');
const icon = buildMeta('icon');
const toast = buildMeta('toast');

registerTokens([
  // Alert
  ...defineComponentTokens(alert, {
    radius: {
      default: 'var(--radius-container)',
      description: 'Alert corner radius.',
      alias: 'alert',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Alert corner geometry.',
    },
  }),

  // Checkbox
  ...defineComponentTokens(checkbox, {
    radius: {
      default: 'var(--radius-tight)',
      description: 'Checkbox corner radius.',
      alias: 'checkbox',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Checkbox corner geometry.',
    },
    size: { default: '1rem', description: 'Checkbox box edge length.' },
  }),
  ...controlSurfaceTokens(checkbox, {}, {}, '1px'),

  // Icon — both the per-variant slots and the standalone `--icon` color.
  ...defineComponentTokens(icon, {
    muted: { default: 'var(--muted-foreground)', description: 'Muted icon color.' },
    primary: {
      default: 'var(--primary)',
      description: 'Primary icon color (interactive accents).',
    },
  }),
  {
    name: 'icon',
    layer: 'component',
    category: 'color',
    appliesTo: 'icon',
    defaultLight: 'var(--foreground)',
    description: 'Default icon color.',
    themePath: 'components.icon.default',
    tailwindNamespace: 'color',
  },

  // Toast
  ...defineComponentTokens(toast, {
    radius: {
      default: 'var(--radius-container)',
      description: 'Toast corner radius.',
      alias: 'toast',
    },
    shadow: {
      default: 'var(--shadow-spotlight)',
      description: 'Toast elevation.',
      alias: 'toast',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Toast corner geometry.',
    },
  }),
]);
