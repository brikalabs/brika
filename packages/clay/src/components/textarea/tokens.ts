/**
 * Layer-2 tokens for Textarea.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_2, SPACING_3 } from '../../tokens/spacing';
import { meta } from './meta';

defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-control)',
    description: 'Textarea corner radius.',
    alias: 'textarea',
  },
  surface: { borderWidth: '1px' },
  geometry: { paddingX: SPACING_3, paddingY: SPACING_2, gap: SPACING_2 },
  typography: { fontSize: 'var(--text-body-md)' },
});
