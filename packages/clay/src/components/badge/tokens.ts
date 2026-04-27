/**
 * Layer-2 tokens for Badge.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_1, SPACING_2 } from '../../tokens/spacing';
import { meta } from './meta';

defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-pill)',
    description: 'Badge corner radius.',
    alias: 'badge',
  },
  surface: true,
  geometry: { height: '1.5rem', paddingX: SPACING_2, paddingY: '0.125rem', gap: SPACING_1 },
  typography: { fontSize: 'var(--text-label-md)' },
});
