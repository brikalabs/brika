/**
 * Layer-2 tokens for Toast.
 */

import { defineComponent } from '../../tokens/define';

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
