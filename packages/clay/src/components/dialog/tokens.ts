/**
 * Layer-2 tokens for Dialog.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_4, SPACING_6 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-surface)',
    description: 'Dialog corner radius.',
    alias: 'dialog',
  },
  shadow: { default: 'var(--shadow-modal)', description: 'Dialog elevation.', alias: 'dialog' },
  border: '1px',
  motion: true,
  backdropBlur: {
    default: '0px',
    description: 'Backdrop blur applied behind a translucent dialog.',
  },
  geometry: { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 },
  slots: {
    container: { default: 'var(--popover)', description: 'Dialog background.' },
    label: { default: 'var(--popover-foreground)', description: 'Dialog text color.' },
  },
});
