/**
 * Layer-2 tokens for Avatar.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, defineComponentTokens } from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    radius: {
      default: '9999px',
      description: 'Avatar corner radius. Default is fully circular.',
      alias: 'avatar',
    },
    'corner-shape': {
      default: 'var(--corner-shape, round)',
      description: 'Avatar corner geometry.',
    },
    size: { default: '2rem', description: 'Avatar diameter at the default size.' },
  }),
]);
