/**
 * Layer-2 tokens for Card.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_4, SPACING_6 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-container)',
    description: 'Card corner radius.',
    alias: 'card',
  },
  shadow: { default: 'var(--shadow-raised)', description: 'Card elevation.', alias: 'card' },
  border: '1px',
  motion: true,
  backdropBlur: {
    default: '0px',
    description: 'Backdrop blur applied behind a translucent card. Set non-zero for glass.',
  },
  geometry: { paddingX: SPACING_6, paddingY: SPACING_6, gap: SPACING_4 },
  typography: { fontSize: 'var(--text-body-md)' },
  slots: {
    container: { default: 'var(--card)', description: 'Card background.' },
    label: { default: 'var(--card-foreground)', description: 'Card text color.' },
  },
});
