/**
 * Layer-2 tokens for Input.
 */

import { defineComponent } from '../../tokens/define';
import { SPACING_2, SPACING_3 } from '../../tokens/spacing';
import { meta } from './meta';

export const tokens = defineComponent(meta.name, {
  radius: {
    default: 'var(--radius-control)',
    description: 'Input corner radius.',
    alias: 'input',
  },
  surface: { borderWidth: '1px' },
  geometry: { height: '2.25rem', paddingX: SPACING_3, paddingY: SPACING_2, gap: SPACING_2 },
  typography: { fontSize: 'var(--text-body-md)' },
  slots: {
    container: { default: 'var(--background)', description: 'Input background.' },
    label: { default: 'var(--foreground)', description: 'Input text color.' },
    border: { default: 'var(--input)', description: 'Input border color.' },
    placeholder: {
      default: 'var(--muted-foreground)',
      description: 'Input placeholder text color.',
    },
  },
});
