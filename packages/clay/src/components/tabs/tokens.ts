/**
 * Layer-2 tokens for Tabs.
 */

import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: { default: 'var(--radius-control)', description: 'Tabs corner radius.', alias: 'tabs' },
  border: '1px',
  motion: true,
  typography: { fontSize: 'var(--text-label-lg)', fontWeight: '500' },
  slots: {
    'trigger-padding-x': {
      default: 'calc(var(--spacing) * 3)',
      description: 'Inline padding inside a tab trigger.',
    },
    'trigger-padding-y': {
      default: 'calc(var(--spacing) * 1.5)',
      description: 'Block padding inside a tab trigger.',
    },
  },
});
