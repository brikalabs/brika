/**
 * Layer-2 tokens for Tooltip.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_1, SPACING_2 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-control)',
    description: 'Tooltip corner radius.',
    alias: 'tooltip',
  },
  shadow: {
    default: 'var(--shadow-overlay)',
    description: 'Tooltip elevation.',
    alias: 'tooltip',
  },
  border: true,
  motion: true,
  geometry: { paddingX: SPACING_2, paddingY: SPACING_1 },
  typography: { fontSize: 'var(--text-label-md)', fontWeight: '500' },
});
