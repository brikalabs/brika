/**
 * Layer-2 tokens for Checkbox.
 */

import { defineComponent } from '../../tokens/define';

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
