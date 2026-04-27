/**
 * Layer-2 tokens for Popover.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_2, SPACING_3 } from '../../tokens/spacing';
import { meta } from './meta';

defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-surface)',
    description: 'Popover corner radius.',
    alias: 'popover',
  },
  shadow: {
    default: 'var(--shadow-overlay)',
    description: 'Popover elevation.',
    alias: 'popover',
  },
  border: '1px',
  motion: true,
  backdropBlur: {
    default: '0px',
    description: 'Backdrop blur applied behind a translucent popover.',
  },
  geometry: { paddingX: SPACING_3, paddingY: SPACING_3, gap: SPACING_2 },
});
