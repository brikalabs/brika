/**
 * Layer-2 tokens for Icon. Includes the bare `--icon` color token (no
 * slot suffix) which falls outside `defineComponent`'s `<name>-<slot>`
 * convention; that one goes through `registerTokens` directly.
 */

import { registerTokens } from '../../tokens/component-registry';
import { defineComponent } from '../../tokens/define';

defineComponent('icon', {
  slots: {
    muted: { default: 'var(--muted-foreground)', description: 'Muted icon color.' },
    primary: {
      default: 'var(--primary)',
      description: 'Primary icon color (interactive accents).',
    },
  },
});

// `--icon` (no suffix) — bare token for the default icon color.
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
