/**
 * Layer-2 tokens for Sidebar.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, defineComponentTokens } from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    width: { default: '16rem', description: 'Sidebar width when expanded.' },
    'width-icon': {
      default: '3rem',
      description: 'Sidebar width when collapsed to icon-only mode.',
    },
    'width-mobile': {
      default: '18rem',
      description: 'Sidebar width when shown as a mobile sheet.',
    },
  }),
]);
