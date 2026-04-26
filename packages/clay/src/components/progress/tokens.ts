/**
 * Layer-2 tokens for Progress.
 */

import { registerTokens } from '../../tokens/component-registry';
import { meta as buildMeta, defineComponentTokens } from '../../tokens/expand';
import { meta } from './meta';

const m = buildMeta(meta.name);

registerTokens([
  ...defineComponentTokens(m, {
    'track-color': {
      default: 'var(--secondary)',
      description: 'Background of the progress track.',
    },
    'indicator-color': {
      default: 'var(--primary)',
      description: 'Foreground of the progress indicator.',
    },
    'track-height': { default: '0.5rem', description: 'Progress track thickness.' },
  }),
]);
