/**
 * Layer-2 tokens for Sidebar.
 */

import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  slots: {
    width: { default: '16rem', description: 'Sidebar width when expanded.' },
    'width-icon': {
      default: '3rem',
      description: 'Sidebar width when collapsed to icon-only mode.',
    },
    'width-mobile': {
      default: '18rem',
      description: 'Sidebar width when shown as a mobile sheet.',
    },
  },
});
