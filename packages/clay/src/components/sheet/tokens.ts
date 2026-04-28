/**
 * Layer-2 tokens for Sheet.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_4, SPACING_6 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-surface)',
    description: 'Sheet corner radius.',
    alias: 'sheet',
  },
  shadow: { default: 'var(--shadow-modal)', description: 'Sheet elevation.', alias: 'sheet' },
  border: '1px',
  motion: true,
  backdropBlur: {
    default: '0px',
    description: 'Backdrop blur applied behind a translucent sheet.',
  },
  geometry: { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 },
});
