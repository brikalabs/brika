/**
 * Layer-2 tokens for components that don't yet have a `src/components/<name>/`
 * folder. When one of those components ships, move its block into the
 * component's own `tokens.ts` and delete the corresponding entry here.
 */

import { defineComponent } from './define';
import { registerTokens } from './component-registry';

defineComponent('alert', {
  radius: {
    default: 'var(--radius-container)',
    description: 'Alert corner radius.',
    alias: 'alert',
  },
});

defineComponent('checkbox', {
  radius: {
    default: 'var(--radius-tight)',
    description: 'Checkbox corner radius.',
    alias: 'checkbox',
  },
  surface: { borderWidth: '1px' },
  slots: {
    size: { default: '1rem', description: 'Checkbox box edge length.' },
  },
});

defineComponent('icon', {
  slots: {
    muted: { default: 'var(--muted-foreground)', description: 'Muted icon color.' },
    primary: {
      default: 'var(--primary)',
      description: 'Primary icon color (interactive accents).',
    },
  },
});

// `--icon` (no suffix) — bare token for the default icon color. Doesn't
// fit the `<name>-<slot>` convention, so register it directly instead of
// going through `defineComponent`.
registerTokens([
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
]);

defineComponent('toast', {
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
});
