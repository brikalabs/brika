/**
 * Layer-2 tokens for Alert.
 */

import { defineComponent } from '../../tokens/define';

export const tokens = defineComponent('alert', {
  radius: {
    default: 'var(--radius-container)',
    description: 'Alert corner radius.',
    alias: 'alert',
  },
});
