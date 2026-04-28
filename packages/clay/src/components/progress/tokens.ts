/**
 * Layer-2 tokens for Progress.
 */

import { defineComponent } from '../../tokens/define';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  slots: {
    'track-color': {
      default: 'var(--secondary)',
      description: 'Background of the progress track.',
    },
    'indicator-color': {
      default: 'var(--primary)',
      description: 'Foreground of the progress indicator.',
    },
    'track-height': { default: '0.5rem', description: 'Progress track thickness.' },
  },
});
